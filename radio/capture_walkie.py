#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import select
import signal
import socket
import subprocess
import sys
import time
import wave
from pathlib import Path

import numpy as np


def utc_now_iso() -> str:
    return dt.datetime.utcnow().replace(tzinfo=dt.timezone.utc).isoformat()


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def touch(path: Path) -> None:
    ensure_parent(path)
    if not path.exists():
        path.write_text("", encoding="utf-8")


def write_json_atomic(path: Path, obj: dict) -> None:
    ensure_parent(path)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)


def append_jsonl(path: Path, obj: dict) -> None:
    ensure_parent(path)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(obj, ensure_ascii=False) + "\n")
        f.flush()


def next_id(meta_path: Path) -> int:
    ensure_parent(meta_path)
    try:
        last = int(meta_path.read_text(encoding="utf-8").strip() or "0")
    except Exception:
        last = 0
    new = last + 1
    meta_path.write_text(str(new), encoding="utf-8")
    return new


def load_json(path: Path) -> dict:
    try:
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return {}


def safe_int(v, default=0) -> int:
    try:
        return int(v)
    except Exception:
        return int(default)


def safe_float(v, default=0.0) -> float:
    try:
        return float(v)
    except Exception:
        return float(default)


def kill_stale_rtl_fm() -> None:
    try:
        out = subprocess.check_output(["pgrep", "-f", r"/\.local-rtl/bin/rtl_fm(\s|$)"], text=True).strip()
        pids = [int(x) for x in out.split() if x.strip().isdigit()]
    except Exception:
        pids = []
    for pid in pids:
        try:
            os.kill(pid, signal.SIGKILL)
        except Exception:
            pass


def try_read_pcm_bytes(proc: subprocess.Popen[bytes], timeout_s: float) -> bytes:
    if not proc.stdout:
        return b""
    fd = proc.stdout.fileno()
    try:
        r, _, _ = select.select([fd], [], [], timeout_s)
    except Exception:
        return b""
    if not r:
        return b""
    try:
        return os.read(fd, 65536)
    except Exception:
        return b""


def rms_energy(x_int16: np.ndarray) -> float:
    if x_int16.size == 0:
        return 0.0
    x = x_int16.astype(np.float32) / 32768.0
    return float(np.sqrt(np.mean(x * x)))


def _extract_active_channel(cfg: dict) -> tuple[str, int, int, str]:
    """Returns (freq, ppm, gain, channelLabel)."""
    if not isinstance(cfg, dict) or not cfg:
        return "", 0, 0, ""

    channel_label = ""
    channels = cfg.get("channels") if isinstance(cfg.get("channels"), list) else []
    active_id = str(cfg.get("activeChannelId") or "").strip()
    active = None
    if channels and active_id:
        for c in channels:
            if str(c.get("id") or "").strip() == active_id:
                active = c
                break
    if not active and channels:
        active = channels[0]

    if isinstance(active, dict):
        channel_label = str(active.get("label") or "").strip()
        freq = str(active.get("freq") or cfg.get("freq") or "").strip()
        ppm = safe_int(active.get("ppm", cfg.get("ppm", 0)) or 0, 0)
        gain = safe_int(active.get("gain", cfg.get("gain", 0)) or 0, 0)
        return freq, ppm, gain, channel_label

    freq = str(cfg.get("freq") or "").strip()
    ppm = safe_int(cfg.get("ppm", 0) or 0, 0)
    gain = safe_int(cfg.get("gain", 0) or 0, 0)
    return freq, ppm, gain, channel_label


def build_rtl_cmd(rtl_fm_path: Path, *, freq: str, rtl_sample_rate: int, squelch: int, squelch_delay: int, gain: int, ppm: int) -> list[str]:
    cmd = [
        str(rtl_fm_path),
        "-f",
        freq,
        "-M",
        "fm",
        "-s",
        str(int(rtl_sample_rate)),
        "-l",
        str(int(squelch)),
        "-t",
        str(int(squelch_delay)),
        "-g",
        str(int(gain)),
        "-",
    ]
    if int(ppm or 0):
        cmd.extend(["-p", str(int(ppm))])
    return cmd


def main() -> int:
    parser = argparse.ArgumentParser(description="Capture PMR446 walkie audio using RTL-SDR (no transcription)")
    parser.add_argument("--config", default="data/radio/config.json", help="JSON config path")
    parser.add_argument("--rtl-sample-rate", type=int, default=24000, help="rtl_fm output sample rate (-s)")
    parser.add_argument("--squelch", type=int, default=0, help="rtl_fm squelch level (-l). Keep 0 if output stalls with squelch.")
    parser.add_argument("--squelch-delay", type=int, default=1, help="rtl_fm squelch delay (-t)")
    parser.add_argument("--vad-threshold", type=float, default=0.03, help="RMS threshold for voice detection")
    parser.add_argument("--hangover-ms", type=int, default=800, help="How long to keep recording after speech ends")
    parser.add_argument("--min-segment-ms", type=int, default=300, help="Ignore speech bursts shorter than this")
    parser.add_argument("--max-segment-ms", type=int, default=20000, help="Cap a single segment length")
    parser.add_argument("--debug-energy", action="store_true", help="Print RMS energy every ~1s")
    parser.add_argument("--no-kill-stale-rtl", action="store_true", help="Do not kill stale rtl_fm processes before starting")
    parser.add_argument("--live", default="data/radio/live.json", help="Write live audio status JSON here")
    parser.add_argument("--segments", default="data/radio/segments.jsonl", help="Output segments JSONL queue")
    parser.add_argument("--meta", default="data/radio/_last_id.txt", help="Internal last-id path (segment id)")
    parser.add_argument("--rtl-fm", default="radio/run-rtl-fm.sh", help="Path to rtl_fm wrapper script")
    parser.add_argument("--clips-dir", default="data/radio/clips", help="Directory to write WAV clips")
    parser.add_argument("--live-audio", default="data/radio/live-audio.wav", help="Rolling WAV buffer for live listening")
    parser.add_argument("--live-audio-window-s", type=float, default=3.0, help="How many seconds of audio to keep in the live buffer")
    parser.add_argument("--monitor-udp-host", default="127.0.0.1", help="Host to send live PCM frames (UDP)")
    parser.add_argument("--monitor-udp-port", type=int, default=7355, help="Port to send live PCM frames (UDP)")

    # Back-compat flags (kept to avoid PM2 config drift).
    # These are mostly ignored because the script is now config-driven.
    parser.add_argument("--udp-host", default=None, help=argparse.SUPPRESS)
    parser.add_argument("--udp-port", type=int, default=None, help=argparse.SUPPRESS)
    parser.add_argument("--segments-dir", default=None, help=argparse.SUPPRESS)
    parser.add_argument("--segments-log", default=None, help=argparse.SUPPRESS)
    parser.add_argument("--status-file", default=None, help=argparse.SUPPRESS)
    parser.add_argument("--live-audio-file", default=None, help=argparse.SUPPRESS)
    parser.add_argument("--sample-rate", type=int, default=None, help=argparse.SUPPRESS)
    parser.add_argument("--chunk-ms", type=int, default=None, help=argparse.SUPPRESS)
    parser.add_argument("--bits", type=int, default=None, help=argparse.SUPPRESS)
    parser.add_argument("--channels", type=int, default=None, help=argparse.SUPPRESS)
    parser.add_argument("--mix-to-mono", default=None, help=argparse.SUPPRESS)
    parser.add_argument("--log-level", default=None, help=argparse.SUPPRESS)
    parser.add_argument("--force", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()

    # Prefer legacy UDP flags if provided.
    if getattr(args, "udp_host", None):
        args.monitor_udp_host = args.udp_host
    if getattr(args, "udp_port", None):
        args.monitor_udp_port = args.udp_port

    # If only legacy --sample-rate was provided, treat it as rtl_fm output rate.
    if getattr(args, "sample_rate", None) and not getattr(args, "rtl_sample_rate", None):
        args.rtl_sample_rate = args.sample_rate

    cfg_path = Path(args.config)
    cfg = load_json(cfg_path)
    freq, ppm, gain, channel_label = _extract_active_channel(cfg)

    if not freq:
        freq = "446.01875M"

    # IMPORTANT: rtl_fm squelch can stop PCM output entirely. Keep it off and rely on VAD.
    squelch = 0
    squelch_delay = 1

    vad_threshold = float(cfg.get("vadThreshold", args.vad_threshold) or args.vad_threshold) if isinstance(cfg, dict) else float(args.vad_threshold)
    hangover_ms = int(cfg.get("hangoverMs", args.hangover_ms) or args.hangover_ms) if isinstance(cfg, dict) else int(args.hangover_ms)

    out_segments = Path(args.segments)
    meta_path = Path(args.meta)
    rtl_fm_path = Path(args.rtl_fm)
    live_path = Path(args.live)
    clips_dir = Path(args.clips_dir)
    live_audio_path = Path(args.live_audio)
    live_audio_window_s = max(0.5, float(args.live_audio_window_s or 3.0))

    if not rtl_fm_path.exists():
        print(f"Missing rtl_fm wrapper: {rtl_fm_path}", file=sys.stderr)
        return 2

    # Make sure files exist so the UI can show status even before the first segment.
    touch(out_segments)
    if not meta_path.exists():
        ensure_parent(meta_path)
        meta_path.write_text("0", encoding="utf-8")

    write_json_atomic(
        live_path,
        {
            "ts": utc_now_iso(),
            "energy": 0.0,
            "threshold": float(vad_threshold),
            "speech": False,
            "note": "starting",
        },
    )

    udp_addr = (str(args.monitor_udp_host), int(args.monitor_udp_port))
    udp_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    udp_sock.setblocking(False)

    def start_rtl() -> subprocess.Popen[bytes]:
        rtl_cmd = build_rtl_cmd(
            rtl_fm_path,
            freq=freq,
            rtl_sample_rate=int(args.rtl_sample_rate),
            squelch=int(squelch),
            squelch_delay=int(squelch_delay),
            gain=int(gain),
            ppm=int(ppm),
        )
        print(f"[radio-capture] Starting rtl_fm: {' '.join(rtl_cmd)}", flush=True)
        if not args.no_kill_stale_rtl:
            kill_stale_rtl_fm()
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

    # Chunking / VAD params
    frame_ms = 100
    frames_per_chunk = int(int(args.rtl_sample_rate) * frame_ms / 1000)
    hangover_chunks = max(1, int(int(hangover_ms) / frame_ms))
    min_chunks = max(1, int(int(args.min_segment_ms) / frame_ms))
    max_chunks = max(1, int(int(args.max_segment_ms) / frame_ms))

    in_speech = False
    hangover_left = 0
    chunks: list[np.ndarray] = []
    debug_count = 0
    last_live_write = 0.0
    last_live_audio_write = 0.0
    pcm_buf = bytearray()

    # Rolling buffer for "listen live" (last N seconds). This is independent from VAD.
    live_audio_buf = np.zeros((0,), dtype=np.int16)
    live_audio_keep = int(int(args.rtl_sample_rate) * live_audio_window_s)

    def write_live_audio() -> None:
        nonlocal live_audio_buf
        try:
            ensure_parent(live_audio_path)
            tmp = live_audio_path.with_suffix(live_audio_path.suffix + ".tmp")
            with wave.open(str(tmp), "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(int(args.rtl_sample_rate))
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
                wf.setframerate(int(args.rtl_sample_rate))
                wf.writeframes(audio_int16.tobytes())
            tmp.replace(clip_path)
        except Exception:
            clip_path = None

        obj = {
            "id": seg_id,
            "ts": utc_now_iso(),
            "freq": str(freq),
            "ppm": int(ppm),
            "gain": int(gain),
            "channelLabel": channel_label,
            "sampleRate": int(args.rtl_sample_rate),
        }
        if clip_path is not None:
            obj["clipPath"] = str(clip_path)
            obj["clipUrl"] = f"/api/radio/clips/{seg_id}.wav"
        append_jsonl(out_segments, obj)

    last_cfg_mtime = 0.0
    last_cfg_check = 0.0

    def maybe_reload_config() -> None:
        nonlocal freq, ppm, gain, channel_label, vad_threshold, hangover_ms, hangover_chunks, last_cfg_mtime
        nonlocal proc

        now = time.time()
        # Throttle disk reads.
        nonlocal last_cfg_check
        if now - last_cfg_check < 0.5:
            return
        last_cfg_check = now

        try:
            st = cfg_path.stat()
            m = float(st.st_mtime)
        except Exception:
            return

        if m <= last_cfg_mtime:
            return
        last_cfg_mtime = m

        cfg2 = load_json(cfg_path)
        freq2, ppm2, gain2, label2 = _extract_active_channel(cfg2)
        vad2 = safe_float(cfg2.get("vadThreshold", vad_threshold), vad_threshold)
        hang2 = safe_int(cfg2.get("hangoverMs", hangover_ms), hangover_ms)

        # Hot-apply VAD parameters.
        vad_threshold = float(vad2)
        hangover_ms = int(hang2)
        hangover_chunks = max(1, int(hangover_ms / frame_ms))

        # If tuner params changed, restart rtl_fm only (keep this process alive).
        if (freq2 and str(freq2).strip() != str(freq).strip()) or int(ppm2) != int(ppm) or int(gain2) != int(gain):
            old = (freq, ppm, gain)
            freq = str(freq2).strip() if freq2 else freq
            ppm = int(ppm2)
            gain = int(gain2)
            channel_label = str(label2 or "").strip()
            print(f"[radio-capture] Retuning (no PM2 restart): {old} -> {(freq, ppm, gain)}", flush=True)

            try:
                stop_proc(proc)
                try:
                    proc.wait(timeout=1.5)
                except Exception:
                    pass
            except Exception:
                pass
            proc = start_rtl()
        else:
            channel_label = str(label2 or "").strip()

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
                write_json_atomic(
                    live_path,
                    {
                        "ts": utc_now_iso(),
                        "energy": 0.0,
                        "threshold": float(vad_threshold),
                        "speech": False,
                        "error": "rtl_fm exited",
                        "stderr": err[-400:].decode(errors="ignore"),
                    },
                )
                raise RuntimeError(f"rtl_fm ended. stderr={err[-400:].decode(errors='ignore')}")

            pcm = try_read_pcm_bytes(proc, timeout_s=0.25)
            if pcm:
                pcm_buf.extend(pcm)

            byte_count = frames_per_chunk * 2
            if len(pcm_buf) < byte_count:
                now = time.time()
                if now - last_live_write >= 0.25:
                    write_json_atomic(
                        live_path,
                        {
                            "ts": utc_now_iso(),
                            "energy": 0.0,
                            "threshold": float(vad_threshold),
                            "speech": False,
                            "note": "No PCM from rtl_fm yet (likely squelch/no signal). Set Squelch=0 and speak on the radio.",
                        },
                    )
                    last_live_write = now
                continue

            chunk_bytes = bytes(pcm_buf[:byte_count])
            del pcm_buf[:byte_count]
            chunk = np.frombuffer(chunk_bytes, dtype=np.int16)

            # Broadcast raw PCM over UDP for the web monitor.
            try:
                udp_sock.sendto(chunk_bytes, udp_addr)
            except Exception:
                pass

            # Update rolling "listen live" buffer and write periodically.
            try:
                if live_audio_keep > 0:
                    live_audio_buf = np.concatenate([live_audio_buf, chunk]).astype(np.int16)
                    if live_audio_buf.size > live_audio_keep:
                        live_audio_buf = live_audio_buf[-live_audio_keep:]
                    now_audio = time.time()
                    if now_audio - last_live_audio_write >= 0.75:
                        write_live_audio()
                        last_live_audio_write = now_audio
            except Exception:
                pass

            energy = rms_energy(chunk)
            if args.debug_energy:
                debug_count += 1
                if debug_count <= 20 or debug_count % 10 == 0:
                    print(f"[radio-capture] energy={energy:.4f} threshold={vad_threshold:.4f}", flush=True)

            speech = energy >= vad_threshold
            now = time.time()
            if now - last_live_write >= 0.25:
                write_json_atomic(
                    live_path,
                    {
                        "ts": utc_now_iso(),
                        "energy": round(float(energy), 6),
                        "threshold": float(vad_threshold),
                        "speech": bool(speech),
                    },
                )
                last_live_write = now

            if speech:
                if not in_speech:
                    in_speech = True
                hangover_left = hangover_chunks
                chunks.append(chunk)
                if len(chunks) >= max_chunks:
                    in_speech = False
                    hangover_left = 0
                    flush_segment()
                continue

            if in_speech:
                if hangover_left > 0:
                    hangover_left -= 1
                    chunks.append(chunk)
                    continue
                in_speech = False
                flush_segment()

    except KeyboardInterrupt:
        print("\n[radio-capture] Stopping...", flush=True)
    finally:
        stop_proc(proc)
        try:
            proc.wait(timeout=2)
        except Exception:
            pass

        try:
            write_live_audio()
        except Exception:
            pass

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
