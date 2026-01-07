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

    if not freq_str:
        freq_str = "446.01875M"

    tune_hz = parse_freq_to_hz(freq_str) or 446_018_750
    sdr_center_hz = pick_sdr_center_hz(cfg_obj, tune_hz)

    # Keep rtl_sdr settings stable to avoid audible dropouts on live edits.
    # Per-channel ppm/gain are applied in software.
    rtl_ppm = 0
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

    touch(out_segments)
    if not meta_path.exists():
        ensure_parent(meta_path)
        meta_path.write_text("0", encoding="utf-8")

    # VAD / chunking
    vad_threshold = float(cfg_obj.get("vadThreshold", args.vad_threshold) or args.vad_threshold)
    hangover_ms = int(cfg_obj.get("hangoverMs", args.hangover_ms) or args.hangover_ms)

    # FM noise squelch (SDR++-like): mute idle hiss, open when carrier/voice present.
    # `squelch` is a noise threshold (0 disables). Lower values open more easily.
    squelch = safe_float(cfg_obj.get("squelch", 0), 0.0)
    squelch_delay_s = safe_float(cfg_obj.get("squelchDelay", 1), 1.0)
    squelch_open = bool(float(squelch) <= 0.0)
    squelch_hold_until = 0.0

    audio_fs = int(args.audio_sample_rate)
    iq_fs = int(args.iq_sample_rate)
    if audio_fs <= 0 or iq_fs <= 0:
        return 2

    decim = max(1, int(round(iq_fs / audio_fs)))
    # enforce exact output fs
    audio_fs = int(round(iq_fs / decim))

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
        nonlocal sdr_center_hz, tune_hz, freq_str, ppm, gain, soft_gain, channel_label, vad_threshold, hangover_ms, hangover_chunks, proc
        nonlocal squelch, squelch_delay_s
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
        freq2, ppm2, gain2, label2 = extract_active_channel(cfg2)
        vad2 = safe_float(cfg2.get("vadThreshold", vad_threshold), vad_threshold)
        hang2 = safe_int(cfg2.get("hangoverMs", hangover_ms), hangover_ms)
        sq2 = safe_float(cfg2.get("squelch", squelch), squelch)
        sqd2 = safe_float(cfg2.get("squelchDelay", squelch_delay_s), squelch_delay_s)

        vad_threshold = float(vad2)
        hangover_ms = int(hang2)
        hangover_chunks = max(1, int(hangover_ms / frame_ms))

        squelch = float(sq2)
        squelch_delay_s = max(0.0, float(sqd2))

        hz2 = parse_freq_to_hz(freq2) if freq2 else None
        if hz2 is None:
            hz2 = tune_hz

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
                # Shift to resemble [-120..-30] range used by UI
                dbm = np.clip(p - 40.0, -140.0, -20.0).astype(np.float32)
                low_hz = int(sdr_center_hz - iq_fs / 2)
                high_hz = int(sdr_center_hz + iq_fs / 2)
                step_hz = float(iq_fs) / float(nfft)
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
                    "dbm": dbm.tolist(),
                }
                try:
                    send_udp_json(analyzer_sock, analyzer_addr, msg)
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
                noise = 0.0
                if float(squelch) > 0.0 and chunk_pcm.size >= 2:
                    x = chunk_pcm.astype(np.float32) / 32768.0
                    d = x[1:] - x[:-1]
                    noise = float(np.sqrt(np.mean(d * d)))
                    now_sq = time.time()
                    if noise <= float(squelch):
                        squelch_open = True
                        squelch_hold_until = now_sq + float(squelch_delay_s)
                    else:
                        if now_sq >= float(squelch_hold_until):
                            squelch_open = False
                else:
                    squelch_open = True

                out_pcm = chunk_pcm if squelch_open else np.zeros_like(chunk_pcm)

                chunk_bytes = out_pcm.tobytes()

                # Broadcast over UDP for web monitor.
                try:
                    udp_sock.sendto(chunk_bytes, udp_addr)
                except Exception:
                    pass

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

                energy = rms_energy(chunk_pcm)
                speech = bool(squelch_open) and (energy >= vad_threshold)

                # VAD segmenting
                if speech:
                    if not in_speech:
                        in_speech = True
                        hangover_left = hangover_chunks
                        chunks = [chunk_pcm]
                    else:
                        chunks.append(chunk_pcm)
                        hangover_left = hangover_chunks
                else:
                    if in_speech:
                        hangover_left -= 1
                        chunks.append(chunk_pcm)
                        if hangover_left <= 0 or len(chunks) >= max_chunks:
                            in_speech = False
                            flush_segment()
                            chunks = []

                now2 = time.time()
                if now2 - last_live_write >= 0.25:
                    write_json_atomic(
                        live_path,
                        {
                            "ts": utc_now_iso(),
                            "energy": float(energy),
                            "noise": float(noise),
                            "threshold": float(vad_threshold),
                            "speech": bool(speech),
                            "squelchOpen": bool(squelch_open),
                            "squelch": float(squelch),
                            "squelchDelay": float(squelch_delay_s),
                            "freq": str(freq_str),
                            "ppm": int(ppm),
                            "gain": int(gain),
                            "channelLabel": channel_label,
                            "audioSampleRate": audio_fs,
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
