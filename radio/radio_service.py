#!/usr/bin/env python3

import argparse
import json
import math
import os
import signal
import socket
import subprocess
import sys
import time
import wave
from datetime import datetime, timezone
from collections import deque
from pathlib import Path

import numpy as np


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_parent(p: Path) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)


def touch(p: Path) -> None:
    ensure_parent(p)
    if not p.exists():
        p.write_text("", encoding="utf-8")


def load_json(path: Path):
    try:
        if not path.exists():
            return {}
        return json.loads(path.read_text(encoding="utf-8") or "{}")
    except Exception:
        return {}


def write_json_atomic(path: Path, obj) -> None:
    try:
        ensure_parent(path)
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(json.dumps(obj, ensure_ascii=False), encoding="utf-8")
        tmp.replace(path)
    except Exception:
        pass


def append_jsonl(path: Path, obj) -> None:
    try:
        ensure_parent(path)
        with path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(obj, ensure_ascii=False) + "\n")
    except Exception:
        pass


def safe_int(v, default: int) -> int:
    try:
        return int(v)
    except Exception:
        return int(default)


def safe_float(v, default: float) -> float:
    try:
        return float(v)
    except Exception:
        return float(default)


def parse_freq_to_hz(text: str | None) -> int | None:
    if not text:
        return None
    s = str(text).strip()
    m = None
    try:
        import re

        m = re.match(r"^\s*([0-9.]+)\s*M\s*$", s, re.IGNORECASE)
    except Exception:
        m = None
    if m:
        try:
            return int(round(float(m.group(1)) * 1_000_000))
        except Exception:
            return None
    try:
        n = float(s)
        if not math.isfinite(n):
            return None
        # Heuristic: small numbers are MHz
        if n < 10_000:
            return int(round(n * 1_000_000))
        return int(round(n))
    except Exception:
        return None


def extract_active_channel(cfg: dict) -> tuple[str | None, int, int, str]:
    # Returns (freqStr, ppm, gain, label)
    channels = cfg.get("channels") if isinstance(cfg.get("channels"), list) else None
    active_id = str(cfg.get("activeChannelId") or "").strip()

    ch = None
    if channels:
        if active_id:
            for c in channels:
                if str(c.get("id")) == active_id:
                    ch = c
                    break
        if ch is None and channels:
            ch = channels[0]

    freq = None
    ppm = 0
    gain = 0
    label = ""

    if isinstance(ch, dict):
        freq = ch.get("freq")
        ppm = safe_int(ch.get("ppm", 0), 0)
        gain = safe_int(ch.get("gain", 0), 0)
        label = str(ch.get("label") or "").strip()

    # Legacy fallback
    if not freq:
        freq = cfg.get("freq")
    if not isinstance(cfg, dict):
        return None, 0, 0, ""

    return (str(freq).strip() if freq else None, int(ppm), int(gain), label)


def get_channels(cfg: dict) -> list[dict]:
    out: list[dict] = []
    chans = cfg.get("channels") if isinstance(cfg.get("channels"), list) else []
    for c in chans:
        if not isinstance(c, dict):
            continue
        freq = str(c.get("freq") or "").strip()
        if not freq:
            continue
        out.append(
            {
                "id": str(c.get("id") or "").strip() or freq,
                "label": str(c.get("label") or "").strip(),
                "freq": freq,
                "freqHz": parse_freq_to_hz(freq),
                "ppm": safe_int(c.get("ppm", 0), 0),
                "gain": safe_int(c.get("gain", 0), 0),
                "ctcssHz": safe_float(c.get("ctcssHz", c.get("ctcss", 0)) or 0, 0.0),
                "dcsCode": str(c.get("dcsCode", c.get("dcs", "")) or "").strip(),
            }
        )
    return out


def find_channel(cfg: dict, channel_id: str | None) -> dict | None:
    cid = str(channel_id or "").strip()
    chans = get_channels(cfg)
    if not chans:
        return None
    if cid:
        for c in chans:
            if str(c.get("id")) == cid:
                return c
    return chans[0]


def resolve_focus_channel_id(chans: list[dict], focus_id: str | None) -> str:
    if not chans:
        return str(focus_id or "").strip()
    fid = str(focus_id or "").strip()
    if fid:
        for ch in chans:
            if str(ch.get("id") or "").strip() == fid:
                return fid
    # Fallback: map to PMR446 channel 2 (446.01875 MHz)
    target_hz = parse_freq_to_hz("446.01875M")
    for ch in chans:
        if int(ch.get("freqHz") or 0) == int(target_hz or 0):
            return str(ch.get("id") or "").strip()
    return str(fid or (chans[0].get("id") or "")).strip()


def goertzel_power(x: np.ndarray, fs_hz: float, f0_hz: float) -> float:
    # Returns magnitude^2 proxy of tone at f0.
    if x.size == 0:
        return 0.0
    fs = float(fs_hz)
    f0 = float(f0_hz)
    if fs <= 0 or f0 <= 0:
        return 0.0
    n = int(x.size)
    k = int(0.5 + (n * f0 / fs))
    if k <= 0:
        return 0.0
    w = 2.0 * math.pi * float(k) / float(n)
    cw = math.cos(w)
    coeff = 2.0 * cw
    s0 = 0.0
    s1 = 0.0
    s2 = 0.0
    # Ensure float32 to keep it fast.
    xf = x.astype(np.float32)
    for v in xf:
        s0 = float(v) + coeff * s1 - s2
        s2 = s1
        s1 = s0
    return float(s2 * s2 + s1 * s1 - coeff * s1 * s2)


def pick_sdr_center_hz(cfg: dict, fallback_hz: int) -> int:
    """Pick a stable SDR center frequency.

    For PMR446-16 we keep a fixed center that covers the whole plan within 240 kHz.
    Otherwise, center on the active channel.
    """
    try:
        plan = str(cfg.get("radioChannelPlan") or "").strip()
        if plan == "pmr446-16":
            # Midpoint of 446.00625 .. 446.19375 MHz
            return 446_100_000
    except Exception:
        pass
    return int(fallback_hz)


def next_id(meta_path: Path) -> int:
    try:
        ensure_parent(meta_path)
        n = 0
        if meta_path.exists():
            n = safe_int(meta_path.read_text(encoding="utf-8").strip() or "0", 0)
        n += 1
        meta_path.write_text(str(n), encoding="utf-8")
        return n
    except Exception:
        return int(time.time())


def rms_energy(x: np.ndarray) -> float:
    if x.size == 0:
        return 0.0
    # int16 PCM expected
    f = x.astype(np.float32) / 32768.0
    return float(np.sqrt(np.mean(f * f)))


def apply_compressor(
    audio_float: np.ndarray,
    threshold_db: float = -20.0,
    ratio: float = 4.0,
    attack_s: float = 0.005,
    release_s: float = 0.1,
    makeup_gain_db: float = 12.0,
    sample_rate: float = 24_000.0,
) -> np.ndarray:
    """Simple feed-forward compressor/limiter with envelope detector."""
    if audio_float.size == 0:
        return audio_float

    threshold_lin = 10 ** (threshold_db / 20.0)
    attack_coef = np.exp(-1.0 / max(sample_rate * max(attack_s, 1e-4), 1.0))
    release_coef = np.exp(-1.0 / max(sample_rate * max(release_s, 1e-4), 1.0))

    env = 0.0
    out = np.zeros_like(audio_float, dtype=np.float32)
    for i, sample in enumerate(audio_float):
        level = abs(sample)
        if level > env:
            env = attack_coef * env + (1 - attack_coef) * level
        else:
            env = release_coef * env + (1 - release_coef) * level

        gain = 1.0
        if env > threshold_lin:
            # Amount over threshold
            over = env / max(threshold_lin, 1e-9)
            compressed = threshold_lin * (over ** (1.0 / max(ratio, 1.0)))
            gain = compressed / max(env, 1e-9)
        out[i] = sample * gain

    makeup = 10 ** (makeup_gain_db / 20.0)
    out *= makeup
    return np.clip(out, -1.0, 1.0)


def make_fir_lowpass(num_taps: int, cutoff_hz: float, fs_hz: float) -> np.ndarray:
    # cutoff_hz must be < fs/2
    if num_taps % 2 == 0:
        num_taps += 1
    fc = float(cutoff_hz) / float(fs_hz)  # cycles per sample (0..0.5)
    n = np.arange(num_taps, dtype=np.float32)
    mid = (num_taps - 1) / 2.0
    h = 2.0 * fc * np.sinc(2.0 * fc * (n - mid))
    # Hamming window
    w = 0.54 - 0.46 * np.cos(2.0 * np.pi * n / (num_taps - 1))
    h = h * w
    h = h / np.sum(h)
    return h.astype(np.float32)


class FirFilter:
    def __init__(self, taps: np.ndarray):
        self.taps = taps.astype(np.float32)
        self.state = np.zeros((len(self.taps) - 1,), dtype=np.float32)

    def process(self, x: np.ndarray) -> np.ndarray:
        if x.size == 0:
            return x.astype(np.float32)
        x = x.astype(np.float32)
        z = np.concatenate([self.state, x])
        y = np.convolve(z, self.taps, mode="valid")
        self.state = z[-(len(self.taps) - 1) :]
        return y.astype(np.float32)


class ComplexFirFilter:
    def __init__(self, taps: np.ndarray):
        self.i = FirFilter(taps)
        self.q = FirFilter(taps)

    def process(self, x: np.ndarray) -> np.ndarray:
        if x.size == 0:
            return x.astype(np.complex64)
        xr = self.i.process(np.real(x).astype(np.float32))
        xq = self.q.process(np.imag(x).astype(np.float32))
        return (xr + 1j * xq).astype(np.complex64)


def deemphasis_iir(x: np.ndarray, fs_hz: float, tau_s: float, state: float) -> tuple[np.ndarray, float]:
    if x.size == 0:
        return x.astype(np.float32), float(state)
    fs = float(fs_hz)
    tau = float(tau_s)
    if fs <= 0 or tau <= 0:
        return x.astype(np.float32), float(state)
    a = math.exp(-1.0 / (fs * tau))
    y = np.empty_like(x, dtype=np.float32)
    s = float(state)
    for i, v in enumerate(x.astype(np.float32)):
        s = a * s + (1.0 - a) * float(v)
        y[i] = s
    return y, float(s)


def build_rtl_sdr_cmd(rtl_sdr_path: Path, center_hz: int, sample_rate: int, gain: int, ppm: int) -> list[str]:
    cmd = [
        str(rtl_sdr_path),
        "-f",
        str(int(center_hz)),
        "-s",
        str(int(sample_rate)),
        "-g",
        str(int(gain)),
    ]
    if int(ppm or 0):
        cmd.extend(["-p", str(int(ppm))])
    # stream to stdout
    cmd.append("-")
    return cmd


def send_udp_json(sock: socket.socket, addr: tuple[str, int], obj) -> None:
    try:
        sock.sendto(json.dumps(obj, ensure_ascii=False, allow_nan=False).encode("utf-8"), addr)
    except Exception:
        pass


def main() -> int:
    parser = argparse.ArgumentParser(description="Radio service: RTL-SDR -> live audio + analyzer + segments")
    parser.add_argument("--config", default="data/radio/config.json", help="JSON config path")
    parser.add_argument("--rtl-sdr", default="radio/run-rtl-sdr.sh", help="Path to rtl_sdr wrapper script")

    parser.add_argument("--iq-sample-rate", type=int, default=240000, help="IQ sample rate for rtl_sdr")
    parser.add_argument("--audio-sample-rate", type=int, default=24000, help="Output audio sample rate")

    parser.add_argument("--vad-threshold", type=float, default=0.03, help="RMS threshold for voice detection")
    parser.add_argument("--hangover-ms", type=int, default=800, help="How long to keep recording after speech ends")
    parser.add_argument("--min-segment-ms", type=int, default=300, help="Ignore speech bursts shorter than this")
    parser.add_argument("--max-segment-ms", type=int, default=20000, help="Cap a single segment length")

    parser.add_argument("--live", default="data/radio/live.json", help="Write live audio status JSON here")
    parser.add_argument("--segments", default="data/radio/segments.jsonl", help="Output segments JSONL queue")
    parser.add_argument("--meta", default="data/radio/_last_id.txt", help="Internal last-id path (segment id)")
    parser.add_argument("--clips-dir", default="data/radio/clips", help="Directory to write WAV clips")
    parser.add_argument("--live-audio", default="data/radio/live-audio.wav", help="Rolling WAV buffer for live listening")
    parser.add_argument("--live-audio-window-s", type=float, default=3.0, help="How many seconds of audio to keep in the live buffer")
    parser.add_argument("--spectrum", default="data/radio/spectrum.json", help="Write latest spectrum snapshot here")
    parser.add_argument("--finder", default="data/radio/finder.json", help="Write rolling finder stats here")

    parser.add_argument("--monitor-udp-host", default="127.0.0.1", help="Host to send live PCM frames (UDP)")
    parser.add_argument("--monitor-udp-port", type=int, default=7355, help="Port to send live PCM frames (UDP)")
    parser.add_argument("--analyzer-udp-host", default="127.0.0.1", help="Host to send analyzer frames (UDP JSON)")
    parser.add_argument("--analyzer-udp-port", type=int, default=7356, help="Port to send analyzer frames (UDP JSON)")

    args = parser.parse_args()

    saved_cfg_path = Path(args.config)
    live_cfg_path = saved_cfg_path.with_name(saved_cfg_path.stem + ".live" + saved_cfg_path.suffix)

    def load_effective_config() -> tuple[dict, Path]:
        if live_cfg_path.exists():
            cfg_live = load_json(live_cfg_path)
            if isinstance(cfg_live, dict):
                return cfg_live, live_cfg_path
        cfg_saved = load_json(saved_cfg_path)
        return (cfg_saved if isinstance(cfg_saved, dict) else {}), saved_cfg_path

    cfg_obj, cfg_path = load_effective_config()
    freq_str, ppm, gain, channel_label = extract_active_channel(cfg_obj)

    channels_cfg = get_channels(cfg_obj)
    active_channel_id = str(cfg_obj.get("activeChannelId") or "").strip()
    active_channel = find_channel(cfg_obj, active_channel_id)
    active_ctcss_hz = float(active_channel.get("ctcssHz") or 0.0) if isinstance(active_channel, dict) else 0.0
    active_dcs_code = str(active_channel.get("dcsCode") or "").strip() if isinstance(active_channel, dict) else ""

    scan_enabled = str(cfg_obj.get("radioMode") or "").strip() == "automatic"
    scan_delta_db = safe_float(cfg_obj.get("scanDeltaDb", 8.0), 8.0)
    scan_hold_s = safe_float(cfg_obj.get("scanHoldS", 1.0), 1.0)
    scan_confirm_n = safe_int(cfg_obj.get("scanConfirmN", 3), 3)
    scan_max_channels = max(0, safe_int(cfg_obj.get("scanMaxChannels", 5), 5))
    scan_focus_id = str(cfg_obj.get("scanFocusId") or "ch2").strip()
    scan_focus_margin_db = safe_float(cfg_obj.get("scanFocusMarginDb", 3.0), 3.0)
    scan_selected_id = active_channel_id
    scan_hold_until = 0.0
    scan_last_best_db = None
    scan_confirm_id = ""
    scan_confirm_count = 0

    if not freq_str:
        freq_str = "446.01875M"

    default_ppm = safe_int(cfg_obj.get("defaultPpm", 25), 25)
    default_gain = safe_int(cfg_obj.get("defaultGain", 35), 35)
    force_defaults = bool(cfg_obj.get("forceDefaults", str(cfg_obj.get("radioChannelPlan") or "") == "pmr446-16"))
    if force_defaults and channels_cfg:
        for ch in channels_cfg:
            ch["ppm"] = int(default_ppm)
            ch["gain"] = int(default_gain)
        ppm = int(default_ppm)
        gain = int(default_gain)

    scan_focus_id = resolve_focus_channel_id(channels_cfg, scan_focus_id)

    tune_hz = parse_freq_to_hz(freq_str) or 446_018_750
    sdr_center_hz = pick_sdr_center_hz(cfg_obj, tune_hz)

    # Keep rtl_sdr settings stable to avoid audible dropouts on live edits.
    # Per-channel ppm/gain are applied in software.
    # Read global SDR PPM correction from config
    rtl_ppm = int(cfg_obj.get("ppm", 0))
    # Use the max configured gain to keep hardware stable; per-channel gain is in software.
    try:
        global_gain = int(cfg_obj.get("gain", gain))
        rtl_gain = int(max([global_gain] + [int(c.get("gain") or 0) for c in channels_cfg] or [0]))
    except Exception:
        rtl_gain = int(gain)
    soft_gain = 1.0

    rtl_sdr_path = Path(args.rtl_sdr)
    if not rtl_sdr_path.exists():
        print(f"Missing rtl_sdr wrapper: {rtl_sdr_path}", file=sys.stderr)
        return 2

    live_path = Path(args.live)
    out_segments = Path(args.segments)
    meta_path = Path(args.meta)
    clips_dir = Path(args.clips_dir)
    live_audio_path = Path(args.live_audio)
    live_audio_window_s = max(0.5, float(args.live_audio_window_s or 3.0))
    spectrum_path = Path(args.spectrum)
    finder_path = Path(args.finder)

    touch(out_segments)
    if not meta_path.exists():
        ensure_parent(meta_path)
        meta_path.write_text("0", encoding="utf-8")

    # VAD / chunking
    vad_threshold = float(cfg_obj.get("vadThreshold", args.vad_threshold) or args.vad_threshold)
    hangover_ms = int(cfg_obj.get("hangoverMs", args.hangover_ms) or args.hangover_ms)
    pre_roll_ms = safe_int(cfg_obj.get("preRollMs", 250), 250)

    # FM noise squelch (SDR++-like): mute idle hiss, open when carrier/voice present.
    # `squelch` is a noise threshold (0 disables). Lower values open more easily.
    squelch = max(0.0, min(0.1, safe_float(cfg_obj.get("squelch", 0), 0.0)))
    squelch_delay_s = safe_float(cfg_obj.get("squelchDelay", 1), 1.0)
    squelch_open = bool(float(squelch) <= 0.0)
    squelch_hold_until = 0.0
    ptt_gate_open = False
    ptt_hold_until = 0.0
    noise_floor = 0.0015
    level_floor = 0.0015
    gate_state = {"last_signal_time": 0.0, "carrier_db": -100.0, "noise_floor_db": -100.0}  # Track carrier detection
    
    # Carrier detection settings (FFT-based squelch)
    carrier_threshold_db = safe_float(cfg_obj.get("carrierThreshold", 18.0), 18.0)
    gate_hold_time = safe_float(cfg_obj.get("gateHoldTime", 0.1), 0.1)

    # Smooth gate edges to avoid end-of-PTT clicks/tail noise (seconds)
    gate_edge_fade_s = 0.008

    audio_fs = int(args.audio_sample_rate)
    iq_fs = int(args.iq_sample_rate)
    if audio_fs <= 0 or iq_fs <= 0:
        return 2

    decim = max(1, int(round(iq_fs / audio_fs)))
    # enforce exact output fs
    audio_fs = int(round(iq_fs / decim))

    # CTCSS/DCS detection helpers (sub-audible filtering)
    ctcss_lp = FirFilter(make_fir_lowpass(num_taps=161, cutoff_hz=300.0, fs_hz=audio_fs))
    tone_hold_until = 0.0
    tone_match = True
    tone_ratio = 0.0
    tone_power = 0.0

    udp_addr = (str(args.monitor_udp_host), int(args.monitor_udp_port))
    udp_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    udp_sock.setblocking(False)

    analyzer_addr = (str(args.analyzer_udp_host), int(args.analyzer_udp_port))
    analyzer_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    analyzer_sock.setblocking(False)

    def send_analyzer_status(ok: bool, state: str, message: str | None = None, extra: dict | None = None) -> None:
        payload = {
            "type": "status",
            "ok": bool(ok),
            "state": str(state or "unknown"),
        }
        if message:
            payload["message"] = str(message)
        if extra and isinstance(extra, dict):
            payload.update(extra)
        send_udp_json(analyzer_sock, analyzer_addr, payload)

    write_json_atomic(
        live_path,
        {
            "ts": utc_now_iso(),
            "energy": 0.0,
            "threshold": float(vad_threshold),
            "speech": False,
            "note": "starting",
            "audioSampleRate": audio_fs,
        },
    )

    send_analyzer_status(True, "starting")

    # Channel-select lowpass (IQ) then audio lowpass (post-demod).
    # For 12.5 kHz NFM, a ~7-8 kHz cutoff works well for voice and rejects adjacent energy.
    ch_taps = make_fir_lowpass(num_taps=129, cutoff_hz=8000.0, fs_hz=iq_fs)
    ch_lp = ComplexFirFilter(ch_taps)

    # Post-demod lowpass for decimation.
    taps = make_fir_lowpass(num_taps=101, cutoff_hz=min(10000.0, 0.45 * audio_fs), fs_hz=iq_fs)
    lp = FirFilter(taps)

    # De-emphasis (land mobile often ~300us). Helps intelligibility.
    deemph_tau_s = 300e-6
    deemph_state = 0.0

    # FFT
    nfft = 1024
    win = np.hamming(nfft).astype(np.float32)
    last_fft_send = 0.0
    fft_interval_s = 0.25

    # Finder (rolling 5-minute analysis window, 1 Hz)
    finder_window_s = float(cfg_obj.get("finderWindowS", 300) or 300)
    finder_min_samples = int(cfg_obj.get("finderMinSamples", 10) or 10)
    finder_last_ts = 0.0
    finder_samples = deque()

    # Pre-roll buffer to avoid cutting the beginning of speech
    pre_roll_keep = max(0, int(round(float(pre_roll_ms) * float(audio_fs) / 1000.0)))
    pre_roll_buf: deque[np.ndarray] = deque()
    pre_roll_samples = 0

    # Chunking / VAD
    frame_ms = 100
    frames_per_chunk = int(audio_fs * frame_ms / 1000)
    hangover_chunks = max(1, int(int(hangover_ms) / frame_ms))
    min_chunks = max(1, int(int(args.min_segment_ms) / frame_ms))
    max_chunks = max(1, int(int(args.max_segment_ms) / frame_ms))

    in_speech = False
    hangover_left = 0
    chunks: list[np.ndarray] = []

    last_live_write = 0.0
    last_live_audio_write = 0.0

    live_audio_buf = np.zeros((0,), dtype=np.int16)
    live_audio_keep = int(audio_fs * live_audio_window_s)

    def write_live_audio() -> None:
        nonlocal live_audio_buf
        try:
            ensure_parent(live_audio_path)
            tmp = live_audio_path.with_suffix(live_audio_path.suffix + ".tmp")
            with wave.open(str(tmp), "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(audio_fs)
                wf.writeframes(live_audio_buf.tobytes())
            tmp.replace(live_audio_path)
        except Exception:
            pass

    def flush_segment() -> None:
        nonlocal chunks
        if len(chunks) < min_chunks:
            chunks = []
            return

        audio_int16 = np.concatenate(chunks).astype(np.int16)
        chunks = []

        seg_id = next_id(meta_path)
        clip_path = None
        try:
            ensure_parent(clips_dir / "x")
            clip_path = clips_dir / f"{seg_id}.wav"
            tmp = clip_path.with_suffix(".wav.tmp")
            with wave.open(str(tmp), "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(audio_fs)
                wf.writeframes(audio_int16.tobytes())
            tmp.replace(clip_path)
        except Exception:
            clip_path = None

        obj = {
            "id": seg_id,
            "ts": utc_now_iso(),
            "freq": str(freq_str),
            "ppm": int(ppm),
            "gain": int(gain),
            "channelLabel": channel_label,
            "sampleRate": int(audio_fs),
        }
        if clip_path is not None:
            obj["clipPath"] = str(clip_path)
            obj["clipUrl"] = f"/api/radio/clips/{seg_id}.wav"
        append_jsonl(out_segments, obj)

    def start_rtl() -> subprocess.Popen[bytes]:
        rtl_cmd = build_rtl_sdr_cmd(
            rtl_sdr_path,
            center_hz=sdr_center_hz,
            sample_rate=iq_fs,
            gain=int(rtl_gain),
            ppm=int(rtl_ppm),
        )
        print(f"[radio] Starting rtl_sdr: {' '.join(rtl_cmd)}", flush=True)
        return subprocess.Popen(
            rtl_cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            bufsize=0,
            preexec_fn=os.setsid if hasattr(os, "setsid") else None,
        )

    proc = start_rtl()

    def stop_proc(p: subprocess.Popen[bytes]) -> None:
        if p.poll() is not None:
            return
        try:
            if hasattr(os, "killpg"):
                os.killpg(p.pid, signal.SIGTERM)
            else:
                p.terminate()
        except Exception:
            try:
                p.terminate()
            except Exception:
                pass

    def close_proc_pipes(p: subprocess.Popen[bytes]) -> None:
        try:
            if p.stdout:
                p.stdout.close()
        except Exception:
            pass
        try:
            if p.stderr:
                p.stderr.close()
        except Exception:
            pass

    def handle_signal(_signum, _frame) -> None:
        stop_proc(proc)
        raise KeyboardInterrupt()

    for signum in (getattr(signal, "SIGINT", None), getattr(signal, "SIGTERM", None)):
        if signum is None:
            continue
        try:
            signal.signal(signum, handle_signal)
        except Exception:
            pass

    # Config hot-reload (saved + live override)
    last_saved_mtime = 0.0
    last_live_mtime = 0.0
    last_cfg_check = 0.0

    def maybe_reload_config() -> None:
        nonlocal cfg_obj, cfg_path
        nonlocal sdr_center_hz, tune_hz, freq_str, ppm, gain, soft_gain, channel_label, vad_threshold, hangover_ms, hangover_chunks, proc
        nonlocal channels_cfg, active_channel_id, active_ctcss_hz, active_dcs_code
        nonlocal scan_enabled, scan_delta_db, scan_hold_s, scan_confirm_n, scan_max_channels, scan_focus_id, scan_focus_margin_db
        nonlocal finder_window_s, finder_min_samples, finder_last_ts, finder_samples
        nonlocal pre_roll_ms, pre_roll_keep, pre_roll_buf, pre_roll_samples
        nonlocal squelch, squelch_delay_s
        nonlocal carrier_threshold_db, gate_hold_time
        nonlocal last_saved_mtime, last_live_mtime, last_cfg_check

        now = time.time()
        if now - last_cfg_check < 0.2:
            return
        last_cfg_check = now

        try:
            saved_m = float(saved_cfg_path.stat().st_mtime) if saved_cfg_path.exists() else 0.0
        except Exception:
            saved_m = 0.0
        try:
            live_m = float(live_cfg_path.stat().st_mtime) if live_cfg_path.exists() else 0.0
        except Exception:
            live_m = 0.0

        if saved_m <= last_saved_mtime and live_m <= last_live_mtime:
            return
        last_saved_mtime = saved_m
        last_live_mtime = live_m

        cfg2, cfg_path2 = load_effective_config()
        if not isinstance(cfg2, dict):
            return

        # Replace the shared config object so other code paths (e.g. compressor) hot-apply.
        cfg_obj = cfg2
        cfg_path = cfg_path2

        channels_cfg = get_channels(cfg2)
        active_channel_id = str(cfg2.get("activeChannelId") or "").strip()
        ch = find_channel(cfg2, active_channel_id)
        active_ctcss_hz = float(ch.get("ctcssHz") or 0.0) if isinstance(ch, dict) else 0.0
        active_dcs_code = str(ch.get("dcsCode") or "").strip() if isinstance(ch, dict) else ""

        scan_enabled = str(cfg2.get("radioMode") or "").strip() == "automatic"
        scan_delta_db = safe_float(cfg2.get("scanDeltaDb", scan_delta_db), scan_delta_db)
        scan_hold_s = safe_float(cfg2.get("scanHoldS", scan_hold_s), scan_hold_s)
        scan_confirm_n = safe_int(cfg2.get("scanConfirmN", scan_confirm_n), scan_confirm_n)
        scan_max_channels = max(0, safe_int(cfg2.get("scanMaxChannels", scan_max_channels), scan_max_channels))
        scan_focus_id = str(cfg2.get("scanFocusId") or scan_focus_id or "ch2").strip()
        scan_focus_margin_db = safe_float(cfg2.get("scanFocusMarginDb", scan_focus_margin_db), scan_focus_margin_db)
        finder_window_s = float(cfg2.get("finderWindowS", finder_window_s) or finder_window_s)
        finder_min_samples = int(cfg2.get("finderMinSamples", finder_min_samples) or finder_min_samples)
        freq2, ppm2, gain2, label2 = extract_active_channel(cfg2)
        vad2 = safe_float(cfg2.get("vadThreshold", vad_threshold), vad_threshold)
        hang2 = safe_int(cfg2.get("hangoverMs", hangover_ms), hangover_ms)
        pre_roll_ms = safe_int(cfg2.get("preRollMs", pre_roll_ms), pre_roll_ms)
        sq2 = safe_float(cfg2.get("squelch", squelch), squelch)
        sqd2 = safe_float(cfg2.get("squelchDelay", squelch_delay_s), squelch_delay_s)

        vad_threshold = float(vad2)
        hangover_ms = int(hang2)
        hangover_chunks = max(1, int(hangover_ms / frame_ms))

        pre_roll_keep = max(0, int(round(float(pre_roll_ms) * float(audio_fs) / 1000.0)))
        pre_roll_buf.clear()
        pre_roll_samples = 0

        squelch = max(0.0, min(0.1, float(sq2)))
        squelch_delay_s = max(0.0, float(sqd2))
        
        # Carrier detection settings reload
        carrier_threshold_db = safe_float(cfg2.get("carrierThreshold", carrier_threshold_db), carrier_threshold_db)
        gate_hold_time = safe_float(cfg2.get("gateHoldTime", gate_hold_time), gate_hold_time)

        hz2 = parse_freq_to_hz(freq2) if freq2 else None
        if hz2 is None:
            hz2 = tune_hz

        default_ppm = safe_int(cfg2.get("defaultPpm", 25), 25)
        default_gain = safe_int(cfg2.get("defaultGain", 35), 35)
        force_defaults = bool(cfg2.get("forceDefaults", str(cfg2.get("radioChannelPlan") or "") == "pmr446-16"))
        if force_defaults and channels_cfg:
            for ch2 in channels_cfg:
                ch2["ppm"] = int(default_ppm)
                ch2["gain"] = int(default_gain)
            ppm2 = int(default_ppm)
            gain2 = int(default_gain)

        scan_focus_id = resolve_focus_channel_id(channels_cfg, scan_focus_id)

        # Digital tune frequency always updates immediately (no rtl_sdr restart if within passband).
        tune_hz = int(hz2)

        # If plan indicates a stable center, use it; otherwise keep current center.
        desired_center = pick_sdr_center_hz(cfg2, sdr_center_hz)
        # If the requested tune falls outside our current IQ span, recenter.
        max_off = int(iq_fs // 2 - 5_000)
        out_of_band = abs(int(tune_hz) - int(sdr_center_hz)) > max_off

        # Apply per-channel ppm/gain without restarting rtl_sdr.
        ppm = int(ppm2)
        gain = int(gain2)
        if int(rtl_gain) > 0 and int(gain) > 0:
            # Treat gain values as dB and convert delta to linear.
            soft_gain = float(10.0 ** ((float(gain) - float(rtl_gain)) / 20.0))
        else:
            soft_gain = 1.0

        needs_restart = bool(out_of_band or int(desired_center) != int(sdr_center_hz))
        freq_str = freq2 or freq_str
        channel_label = str(label2 or "").strip()

        if needs_restart:
            old = sdr_center_hz
            sdr_center_hz = int(desired_center) if (out_of_band or int(desired_center) != int(sdr_center_hz)) else int(sdr_center_hz)
            print(f"[radio] Restarting rtl_sdr (recenter): {old} -> {sdr_center_hz} (tune={tune_hz})", flush=True)
            send_analyzer_status(True, "restarting")
            try:
                stop_proc(proc)
                try:
                    proc.wait(timeout=1.5)
                except Exception:
                    pass
                close_proc_pipes(proc)
            except Exception:
                pass
            proc = start_rtl()

            # Reset buffers so we don't smear old samples across a retune.
            nonlocal iq_buf, audio_buf
            iq_buf = bytearray()
            audio_buf = np.zeros((0,), dtype=np.int16)

    # Read loop: rtl_sdr outputs unsigned 8-bit IQ interleaved
    iq_buf = bytearray()
    audio_buf = np.zeros((0,), dtype=np.int16)

    restart_backoff_s = 0.25
    restart_backoff_max_s = 5.0

    def restart_rtl(reason: str, stderr_tail: str | None = None) -> None:
        nonlocal proc, restart_backoff_s, iq_buf, audio_buf

        msg = reason or "rtl_sdr restart"
        if stderr_tail:
            msg = f"{msg}: {stderr_tail}"

        write_json_atomic(
            live_path,
            {
                "ts": utc_now_iso(),
                "energy": 0.0,
                "threshold": float(vad_threshold),
                "speech": False,
                "error": reason or "rtl_sdr exited",
                "stderr": (stderr_tail or "")[:400],
                "freq": str(freq_str),
                "ppm": int(ppm),
                "gain": int(gain),
                "channelLabel": channel_label,
                "audioSampleRate": audio_fs,
            },
        )
        send_analyzer_status(False, "error", msg)

        try:
            stop_proc(proc)
            try:
                proc.wait(timeout=1.5)
            except Exception:
                pass
            close_proc_pipes(proc)
        except Exception:
            pass

        time.sleep(max(0.05, float(restart_backoff_s)))
        try:
            proc = start_rtl()
            iq_buf = bytearray()
            audio_buf = np.zeros((0,), dtype=np.int16)
            send_analyzer_status(True, "starting")
        except Exception as e:
            send_analyzer_status(False, "error", f"Failed to start rtl_sdr: {e}")

        restart_backoff_s = min(restart_backoff_max_s, restart_backoff_s * 2.0)

    # Digital tuning state (complex mixer)
    mix_phase = 0.0

    try:
        while True:
            maybe_reload_config()

            if proc.poll() is not None:
                err = b""
                if proc.stderr:
                    try:
                        err = proc.stderr.read() or b""
                    except Exception:
                        err = b""
                restart_rtl("rtl_sdr exited", err[-400:].decode(errors="ignore"))
                continue

            # Read some IQ bytes
            try:
                chunk = proc.stdout.read(16384) if proc.stdout else b""
            except Exception:
                chunk = b""
            if not chunk:
                time.sleep(0.01)
                continue

            # Data is flowing; reset backoff.
            restart_backoff_s = 0.25
            iq_buf.extend(chunk)

            # Need even number of bytes (I,Q)
            if len(iq_buf) < 2 * 4096:
                continue

            # Use a slice for processing, keep remainder
            take = (len(iq_buf) // 2) * 2
            raw = bytes(iq_buf[:take])
            del iq_buf[:take]

            u8 = np.frombuffer(raw, dtype=np.uint8)
            if u8.size < 2:
                continue
            u8 = u8[: (u8.size // 2) * 2]
            iq_u8 = u8.reshape((-1, 2)).astype(np.float32)
            i = (iq_u8[:, 0] - 127.5) / 128.0
            q = (iq_u8[:, 1] - 127.5) / 128.0
            iq = i + 1j * q

            # Mix desired channel to baseband without restarting rtl_sdr.
            # Offset = tune - sdr_center.
            # If hardware ppm correction isn't applied in rtl_sdr, correct it in the mixer.
            # Match rtl_sdr -p behavior directionally: positive ppm typically compensates a low LO.
            # Approx: frequency error scales with tuned frequency.
            ppm_corr_hz = float(int(ppm)) * float(int(tune_hz)) / 1_000_000.0
            off_hz = float(int(tune_hz) - int(sdr_center_hz)) + ppm_corr_hz
            if abs(off_hz) > 0.1:
                n = np.arange(iq.size, dtype=np.float32)
                w = 2.0 * np.pi * off_hz / float(iq_fs)
                osc = np.exp(-1j * (mix_phase + w * n)).astype(np.complex64)
                iq_tuned = (iq * osc).astype(np.complex64)
                mix_phase = float((mix_phase + w * float(iq.size)) % (2.0 * np.pi))
            else:
                iq_tuned = iq

            # Analyzer FFT (send at limited rate)
            now = time.time()
            if now - last_fft_send >= fft_interval_s and iq.size >= nfft:
                last_fft_send = now
                # FFT shows the full IQ window around SDR center
                block = iq[:nfft]
                spec = np.fft.fftshift(np.fft.fft(block * win))
                p = 20.0 * np.log10(np.abs(spec) / nfft + 1e-12)

                low_hz = float(int(sdr_center_hz - iq_fs / 2))
                step_hz = float(iq_fs) / float(nfft)

                # Auto-scan: pick the strongest channel in the plan (Automatic mode).
                if scan_enabled and channels_cfg:
                    noise_floor = float(np.median(p))
                    best = None
                    best_db = None
                    focus = None
                    focus_db = None
                    half_bw_hz = 6250.0
                    half_bins = max(1, int(round(half_bw_hz / step_hz)))
                    scan_channels = channels_cfg
                    if int(scan_max_channels) > 0:
                        scan_channels = channels_cfg[: int(scan_max_channels)]
                    for ch in scan_channels:
                        # Skip channels disabled for scanning (Auto mode checkbox)
                        if ch.get("scanEnabled") is False:
                            continue
                        hz = ch.get("freqHz")
                        if hz is None:
                            hz = parse_freq_to_hz(str(ch.get("freq") or ""))
                            ch["freqHz"] = hz
                        if hz is None:
                            continue
                        idx = int(round((float(hz) - low_hz) / step_hz))
                        i0 = max(0, idx - half_bins)
                        i1 = min(nfft - 1, idx + half_bins)
                        if i1 <= i0:
                            continue
                        v = float(np.mean(p[i0:i1]))
                        if str(ch.get("id") or "") and str(ch.get("id") or "") == str(scan_focus_id or ""):
                            focus = ch
                            focus_db = float(v)
                        if best_db is None or v > best_db:
                            best_db = v
                            best = ch

                    if focus is not None and focus_db is not None and best is not None and best_db is not None:
                        try:
                            focus_margin = float(scan_focus_margin_db)
                        except Exception:
                            focus_margin = 0.0
                        if str(best.get("id") or "") != str(scan_focus_id or "") and float(best_db) < float(focus_db) + float(focus_margin):
                            best = focus
                            best_db = focus_db

                    if best is not None and best_db is not None:
                        scan_last_best_db = float(best_db)

                        best_id = str(best.get("id") or "")
                        strong_enough = float(best_db) >= float(noise_floor + scan_delta_db)
                        can_switch = now >= float(scan_hold_until)

                        # Confirmation logic: require the same best channel for N frames
                        # before switching. This reduces rapid hopping on noise.
                        if best_id and best_id == scan_confirm_id:
                            scan_confirm_count += 1
                        else:
                            scan_confirm_id = best_id
                            scan_confirm_count = 1

                        should_pick = can_switch and strong_enough and (scan_confirm_count >= max(1, int(scan_confirm_n)))
                        if should_pick:
                            scan_selected_id = best_id
                            scan_hold_until = now + float(scan_hold_s)
                            scan_confirm_count = 0

                            # Switch to the best channel without restarting.
                            try:
                                hz2 = int(best.get("freqHz") or 0)
                                if hz2 > 0:
                                    tune_hz = hz2
                                    freq_str = str(best.get("freq") or freq_str)
                                    channel_label = str(best.get("label") or "").strip()
                                    ppm = safe_int(best.get("ppm", ppm), ppm)
                                    gain = safe_int(best.get("gain", gain), gain)
                                    active_ctcss_hz = float(best.get("ctcssHz") or 0.0)
                                    active_dcs_code = str(best.get("dcsCode") or "").strip()
                                    if int(rtl_gain) > 0 and int(gain) > 0:
                                        soft_gain = float(10.0 ** ((float(gain) - float(rtl_gain)) / 20.0))
                                    else:
                                        soft_gain = 1.0
                            except Exception:
                                pass
                # Rolling finder stats (1 Hz) based on current spectrum
                if now - finder_last_ts >= 1.0 and channels_cfg:
                    finder_last_ts = now
                    scan_channels = channels_cfg
                    if int(scan_max_channels) > 0:
                        scan_channels = channels_cfg[: int(scan_max_channels)]
                    channel_powers = []
                    for ch in scan_channels:
                        hz = ch.get("freqHz")
                        if hz is None:
                            hz = parse_freq_to_hz(str(ch.get("freq") or ""))
                            ch["freqHz"] = hz
                        if hz is None:
                            continue
                        idx = int(round((float(hz) - low_hz) / step_hz))
                        half_bins = max(1, int(round(6250.0 / step_hz)))
                        i0 = max(0, idx - half_bins)
                        i1 = min(nfft - 1, idx + half_bins)
                        if i1 <= i0:
                            continue
                        v = float(np.mean(p[i0:i1]))
                        channel_powers.append(
                            {
                                "id": str(ch.get("id") or ""),
                                "label": str(ch.get("label") or ""),
                                "freq": str(ch.get("freq") or ""),
                                "freqHz": int(hz),
                                "avgDb": v,
                            }
                        )
                    finder_samples.append({"ts": now, "noiseFloor": float(noise_floor), "channels": channel_powers})
                    # Trim old samples
                    while finder_samples and now - float(finder_samples[0].get("ts", now)) > float(finder_window_s):
                        finder_samples.popleft()

                    # Compute rolling stats
                    stats = {}
                    noise_vals = [float(s.get("noiseFloor", 0.0)) for s in finder_samples]
                    noise_floor_avg = float(np.mean(noise_vals)) if noise_vals else None
                    for s in finder_samples:
                        for ch in s.get("channels", []):
                            cid = str(ch.get("id") or "")
                            if not cid:
                                continue
                            stats.setdefault(cid, {"label": ch.get("label"), "freq": ch.get("freq"), "freqHz": ch.get("freqHz"), "vals": []})
                            stats[cid]["vals"].append(float(ch.get("avgDb", 0.0)))

                    results = []
                    for cid, item in stats.items():
                        vals = item.get("vals", [])
                        if not vals:
                            continue
                        avg = float(np.mean(vals))
                        peak = float(np.max(vals))
                        stdev = float(np.std(vals))
                        snr = float(avg - noise_floor_avg) if noise_floor_avg is not None else None
                        results.append(
                            {
                                "id": cid,
                                "label": str(item.get("label") or ""),
                                "freq": str(item.get("freq") or ""),
                                "freqHz": int(item.get("freqHz") or 0),
                                "avgDb": avg,
                                "peakDb": peak,
                                "stdevDb": stdev,
                                "snrDb": snr,
                                "samples": len(vals),
                            }
                        )
                    results.sort(key=lambda r: (r.get("snrDb") is None, -(r.get("snrDb") or -9999), -(r.get("avgDb") or -9999)))

                    best = results[0] if results else None
                    focus = next((r for r in results if r.get("id") == str(scan_focus_id or "")), None)
                    if best and focus and focus != best:
                        best_db = float(best.get("avgDb") or -9999)
                        focus_db = float(focus.get("avgDb") or -9999)
                        if best_db < focus_db + float(scan_focus_margin_db):
                            best = focus

                    if len(finder_samples) >= int(max(1, finder_min_samples)):
                        try:
                            write_json_atomic(
                                finder_path,
                                {
                                    "ts": utc_now_iso(),
                                    "windowS": float(finder_window_s),
                                    "samples": len(finder_samples),
                                    "noiseFloorDb": noise_floor_avg,
                                    "focusId": str(scan_focus_id or ""),
                                    "focusMarginDb": float(scan_focus_margin_db),
                                    "best": best,
                                    "channels": results,
                                },
                            )
                        except Exception:
                            pass

                # Shift to resemble [-120..-30] range used by UI
                dbm = np.clip(p - 40.0, -140.0, -20.0).astype(np.float32)
                low_hz = int(sdr_center_hz - iq_fs / 2)
                high_hz = int(sdr_center_hz + iq_fs / 2)
                
                # Carrier detection: measure power at tuned frequency vs noise floor
                try:
                    tune_idx = int(round((float(tune_hz) - float(low_hz)) / step_hz))
                    half_bw = max(1, int(round(6250.0 / step_hz)))  # ~6.25kHz half-bandwidth for NFM
                    i0 = max(0, tune_idx - half_bw)
                    i1 = min(nfft - 1, tune_idx + half_bw)
                    if i1 > i0:
                        carrier_power_db = float(np.max(p[i0:i1]))  # Peak power at channel
                        noise_floor_db = float(np.median(p))  # Overall noise floor
                        gate_state["carrier_db"] = carrier_power_db
                        gate_state["noise_floor_db"] = noise_floor_db
                except Exception:
                    pass
                
                msg = {
                    "type": "fft",
                    "lowHz": low_hz,
                    "highHz": high_hz,
                    "stepHz": step_hz,
                    "centerHz": int(sdr_center_hz),
                    "tuneHz": int(tune_hz),
                    "freq": str(freq_str),
                    "channelLabel": channel_label,
                    "ppm": int(ppm),
                    "gain": int(gain),
                    "scan": {
                        "enabled": bool(scan_enabled),
                        "selectedId": str(scan_selected_id or ""),
                        "bestDb": float(scan_last_best_db) if scan_last_best_db is not None else None,
                        "deltaDb": float(scan_delta_db),
                    },
                    "dbm": dbm.tolist(),
                }
                try:
                    send_udp_json(analyzer_sock, analyzer_addr, msg)
                except Exception:
                    pass
                try:
                    write_json_atomic(
                        spectrum_path,
                        {
                            "ts": utc_now_iso(),
                            "lowHz": low_hz,
                            "highHz": high_hz,
                            "stepHz": step_hz,
                            "centerHz": int(sdr_center_hz),
                            "tuneHz": int(tune_hz),
                            "freq": str(freq_str),
                            "channelLabel": channel_label,
                            "ppm": int(ppm),
                            "gain": int(gain),
                            "scan": {
                                "enabled": bool(scan_enabled),
                                "selectedId": str(scan_selected_id or ""),
                                "bestDb": float(scan_last_best_db) if scan_last_best_db is not None else None,
                                "deltaDb": float(scan_delta_db),
                                "maxChannels": int(scan_max_channels),
                                "focusId": str(scan_focus_id or ""),
                                "focusMarginDb": float(scan_focus_margin_db),
                            },
                            "dbm": dbm.tolist(),
                        },
                    )
                except Exception:
                    pass

            # Channel-select filtering (reduces adjacent-channel distortion).
            iq_ch = ch_lp.process(iq_tuned)

            # NFM demod
            if iq_ch.size < 2:
                continue
            demod = np.angle(iq_ch[1:] * np.conj(iq_ch[:-1])).astype(np.float32)
            demod_f = lp.process(demod)
            if demod_f.size == 0:
                continue
            demod_dec = demod_f[::decim]
            if soft_gain != 1.0:
                demod_dec = (demod_dec * float(soft_gain)).astype(np.float32)

            demod_dec, deemph_state = deemphasis_iir(demod_dec.astype(np.float32), audio_fs, deemph_tau_s, deemph_state)

            # Convert to int16 PCM. Scale factor tuned empirically.
            pcm = np.clip(demod_dec * 9000.0, -32768.0, 32767.0).astype(np.int16)
            if pcm.size == 0:
                continue

            audio_buf = np.concatenate([audio_buf, pcm]).astype(np.int16)

            # Consume in 100ms frames
            while audio_buf.size >= frames_per_chunk:
                chunk_pcm = audio_buf[:frames_per_chunk]
                audio_buf = audio_buf[frames_per_chunk:]

                # Noise squelch: use high-frequency proxy (derivative RMS).
                x = chunk_pcm.astype(np.float32) / 32768.0 if chunk_pcm.size else np.zeros(0, dtype=np.float32)
                audio_level = float(np.sqrt(np.mean(x * x))) if x.size else 0.0
                noise = 0.0
                if chunk_pcm.size >= 2:
                    d = x[1:] - x[:-1]
                    noise = float(np.sqrt(np.mean(d * d)))

                # Track adaptive noise/level floors so high gain hiss can be treated as baseline.
                # Manual override: if manual floors are set, use them instead of adaptive
                adaptive_mode = bool(cfg_obj.get("adaptiveFloors", True))
                manual_noise_floor = float(cfg_obj.get("manualNoiseFloor", 0.0))
                manual_level_floor = float(cfg_obj.get("manualLevelFloor", 0.0))
                
                # GOAL: Silence when idle, voice when PTT pressed
                # Use CARRIER DETECTION from FFT, not audio RMS
                # Carrier = strong signal at tuned frequency above noise floor
                
                carrier_db_val = gate_state.get("carrier_db", -100.0)
                noise_floor_db_val = gate_state.get("noise_floor_db", -100.0)
                carrier_snr = carrier_db_val - noise_floor_db_val  # dB above noise floor
                
                # Carrier detected if signal is above threshold dB above noise floor (configurable)
                has_carrier = bool(carrier_snr >= carrier_threshold_db)
                
                now_sq = time.time()
                
                # Update last signal time when carrier is detected
                if has_carrier:
                    gate_state["last_signal_time"] = now_sq
                
                # Hold time is configurable
                time_since_signal = now_sq - gate_state["last_signal_time"]

                voice_trigger = has_carrier
                level_trigger = has_carrier

                # Privacy squelch (CTCSS/DCS)
                tone_ratio = 0.0
                tone_power = 0.0
                mode = "none"
                target = None
                if float(active_ctcss_hz or 0.0) > 0.0:
                    mode = "ctcss"
                    target = float(active_ctcss_hz)
                    tone_match = False  # Start closed; open only when tone detected
                    try:
                        # Analyze unmuted chunk.
                        xf = (chunk_pcm.astype(np.float32) / 32768.0)
                        sub = ctcss_lp.process(xf)
                        tp = goertzel_power(sub, audio_fs, float(active_ctcss_hz))
                        nf = float(np.mean(sub.astype(np.float32) ** 2)) + 1e-9
                        tone_power = float(tp)
                        tone_ratio = float(tp / (nf * float(sub.size) + 1e-9))
                        now_t = time.time()
                        if (tp > 1e-4) and (tone_ratio > 0.08):
                            tone_match = True
                            tone_hold_until = now_t + 0.6
                        else:
                            tone_match = bool(now_t < float(tone_hold_until))
                    except Exception:
                        tone_match = True  # On error, fail open
                elif str(active_dcs_code or "").strip():
                    # Best-effort: DCS decode is non-trivial; treat as carrier squelch for now.
                    mode = "dcs"
                    target = str(active_dcs_code or "").strip()
                    tone_match = True
                else:
                    # No privacy code configured = always open
                    tone_match = True

                # Gate gain: hold full audio for gate_hold_time, then close with a short fade.
                hold = max(float(gate_hold_time), 0.0)
                ptt_gate_gain = 1.0 if (has_carrier or (time_since_signal < hold)) else 0.0

                ptt_gate_open = bool(ptt_gate_gain > 0.0)
                # Simple squelch follows PTT gate
                squelch_open = bool(ptt_gate_open)

                gate_target_gain = float(ptt_gate_gain) if (bool(squelch_open) and bool(tone_match)) else 0.0
                final_open = bool(gate_target_gain > 0.0)

                # Build output audio AFTER plugins, so Listen Live + clips match what you hear.
                if chunk_pcm.size == 0:
                    out_pcm = chunk_pcm
                else:
                    comp_in_rms = 0.0
                    comp_out_rms = 0.0
                    comp_applied = False

                    prev_gain = float(getattr(start_rtl, "_gate_gain_prev", 0.0))
                    target_gain = float(gate_target_gain)
                    if prev_gain <= 0.0 and target_gain <= 0.0:
                        out_pcm = np.zeros_like(chunk_pcm)
                    else:
                        audio_float = chunk_pcm.astype(np.float32) / 32768.0

                        # Smooth gain transitions to avoid clicks.
                        fade_n = max(1, int(float(audio_fs) * float(gate_edge_fade_s)))
                        if abs(target_gain - prev_gain) < 1e-6:
                            gate_gain_vec = np.full((audio_float.size,), target_gain, dtype=np.float32)
                        else:
                            n = min(fade_n, int(audio_float.size))
                            if n <= 1:
                                gate_gain_vec = np.full((audio_float.size,), target_gain, dtype=np.float32)
                            else:
                                ramp = np.linspace(prev_gain, target_gain, n, dtype=np.float32)
                                if audio_float.size > n:
                                    gate_gain_vec = np.concatenate(
                                        [ramp, np.full((audio_float.size - n,), target_gain, dtype=np.float32)]
                                    )
                                else:
                                    gate_gain_vec = ramp

                        # Compressor meters should reflect what we actually *output* (post gate).
                        pre_comp_for_meter = audio_float * gate_gain_vec
                        comp_in_rms = float(np.sqrt(np.mean(pre_comp_for_meter * pre_comp_for_meter))) if pre_comp_for_meter.size else 0.0
                        comp_out_rms = comp_in_rms

                        # Apply compressor/limiter only while carrier is present (avoid boosting end-of-PTT noise).
                        comp_cfg = cfg_obj.get("compressor", {})
                        if has_carrier and comp_cfg.get("enabled", True):
                            threshold_db = float(comp_cfg.get("threshold", -20))
                            ratio = float(comp_cfg.get("ratio", 4.0))
                            attack_s = float(comp_cfg.get("attack", 0.005))
                            release_s = float(comp_cfg.get("release", 0.1))
                            makeup_gain_db = float(comp_cfg.get("makeupGain", 12))
                            audio_float = apply_compressor(
                                audio_float,
                                threshold_db=threshold_db,
                                ratio=ratio,
                                attack_s=attack_s,
                                release_s=release_s,
                                makeup_gain_db=makeup_gain_db,
                                sample_rate=audio_fs,
                            )
                            comp_applied = True
                            post_comp_for_meter = audio_float * gate_gain_vec
                            comp_out_rms = float(np.sqrt(np.mean(post_comp_for_meter * post_comp_for_meter))) if post_comp_for_meter.size else 0.0

                        audio_float = audio_float * gate_gain_vec
                        out_pcm = np.clip(audio_float * 32768.0, -32768, 32767).astype(np.int16)
                    setattr(start_rtl, "_gate_gain_prev", float(target_gain))

                    # Store latest compressor meter values for admin UI.
                    try:
                        gate_state["comp_in_rms"] = float(comp_in_rms)
                        gate_state["comp_out_rms"] = float(comp_out_rms)
                        gate_state["comp_applied"] = bool(comp_applied)
                    except Exception:
                        pass

                # Debug: Log audio gate status every 2 seconds
                now_debug = time.time()
                if not hasattr(start_rtl, '_last_debug_log'):
                    start_rtl._last_debug_log = 0.0
                if now_debug - start_rtl._last_debug_log >= 2.0:
                    pcm_rms = float(np.sqrt(np.mean((chunk_pcm.astype(np.float32) / 32768.0) ** 2)))
                    out_rms = float(np.sqrt(np.mean((out_pcm.astype(np.float32) / 32768.0) ** 2)))
                    carrier_db = gate_state.get("carrier_db", -100.0)
                    noise_floor_db = gate_state.get("noise_floor_db", -100.0)
                    carrier_snr = carrier_db - noise_floor_db
                    print(
                        f"[audio] final_open={final_open} ptt_gate={ptt_gate_open} | "
                        f"carrier_snr={carrier_snr:.1f}dB carrier={carrier_db:.1f}dB floor={noise_floor_db:.1f}dB | "
                        f"OUT_RMS={out_rms:.4f} hasCarrier={voice_trigger}",
                        flush=True,
                    )
                    start_rtl._last_debug_log = now_debug

                # Broadcast over UDP for web monitor.
                # This is the *post-processing* audio (compressor + gate), matching what
                # we write to clips and what the transcriber will hear.
                try:
                    udp_sock.sendto(out_pcm.tobytes(), udp_addr)
                except Exception:
                    pass

                # Update pre-roll buffer from raw audio before gating (helps avoid clipping starts)
                if pre_roll_keep > 0 and chunk_pcm.size:
                    pre_roll_buf.append(chunk_pcm.copy())
                    pre_roll_samples += int(chunk_pcm.size)
                    while pre_roll_samples > pre_roll_keep and pre_roll_buf:
                        dropped = pre_roll_buf.popleft()
                        pre_roll_samples -= int(dropped.size)

                # Rolling listen buffer
                try:
                    if live_audio_keep > 0:
                        live_audio_buf = np.concatenate([live_audio_buf, out_pcm]).astype(np.int16)
                        if live_audio_buf.size > live_audio_keep:
                            live_audio_buf = live_audio_buf[-live_audio_keep:]
                        now_audio = time.time()
                        if now_audio - last_live_audio_write >= 0.75:
                            write_live_audio()
                            last_live_audio_write = now_audio
                except Exception:
                    pass

                energy = rms_energy(out_pcm)
                speech = bool(final_open) and (energy >= vad_threshold)

                # Segmenting: cut clips by PTT (carrier gate) on/off.
                # This produces one clip per push-to-talk transmission (including pauses).
                if ptt_gate_open:
                    if not in_speech:
                        in_speech = True
                        if pre_roll_buf:
                            try:
                                pre = np.concatenate(list(pre_roll_buf)).astype(np.int16)
                            except Exception:
                                pre = np.zeros(0, dtype=np.int16)
                            pre_roll_buf.clear()
                            pre_roll_samples = 0
                            if pre.size:
                                chunks = [pre, out_pcm]
                            else:
                                chunks = [out_pcm]
                        else:
                            chunks = [out_pcm]
                    else:
                        chunks.append(out_pcm)

                    if len(chunks) >= max_chunks:
                        flush_segment()
                        chunks = []
                        in_speech = True
                else:
                    if in_speech:
                        in_speech = False
                        flush_segment()
                        chunks = []

                now2 = time.time()
                if now2 - last_live_write >= 0.25:
                    comp_in_rms = float(gate_state.get("comp_in_rms", 0.0) or 0.0)
                    comp_out_rms = float(gate_state.get("comp_out_rms", 0.0) or 0.0)
                    comp_applied = bool(gate_state.get("comp_applied", False))
                    write_json_atomic(
                        live_path,
                        {
                            "ts": utc_now_iso(),
                            "energy": float(energy),
                            "noise": float(noise),
                            "threshold": float(vad_threshold),
                            "voiceTrigger": bool(voice_trigger),
                            "speech": bool(speech),
                            "squelchOpen": bool(squelch_open),
                            "pttGateOpen": bool(ptt_gate_open),
                            "squelch": float(squelch),
                            "squelchDelay": float(squelch_delay_s),
                            "privacy": {
                                "mode": mode,
                                "target": target,
                                "match": bool(tone_match),
                                "ratio": float(tone_ratio),
                                "power": float(tone_power),
                            },
                            "scan": {
                                "enabled": bool(scan_enabled),
                                "selectedId": str(scan_selected_id or ""),
                                "bestDb": float(scan_last_best_db) if scan_last_best_db is not None else None,
                                "deltaDb": float(scan_delta_db),
                                "maxChannels": int(scan_max_channels),
                                "focusId": str(scan_focus_id or ""),
                                "focusMarginDb": float(scan_focus_margin_db),
                            },
                            "freq": str(freq_str),
                            "ppm": int(ppm),
                            "gain": int(gain),
                            "channelLabel": channel_label,
                            "audioSampleRate": audio_fs,
                            "compressorMeters": {
                                "inRms": comp_in_rms,
                                "outRms": comp_out_rms,
                                "applied": bool(comp_applied),
                            },
                        },
                    )
                    last_live_write = now2

    except KeyboardInterrupt:
        pass
    finally:
        try:
            stop_proc(proc)
            close_proc_pipes(proc)
        except Exception:
            pass

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
