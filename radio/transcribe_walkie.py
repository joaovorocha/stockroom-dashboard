#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import select
import signal
import subprocess
import sys
import time
import wave
from pathlib import Path

import numpy as np
from faster_whisper import WhisperModel


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


def main() -> int:
    parser = argparse.ArgumentParser(description="Transcribe PMR446 walkie audio using RTL-SDR + Whisper")
    parser.add_argument("--config", default="data/radio/config.json", help="Optional JSON config path")
    parser.add_argument("--freq", default="446.01875M", help="Center frequency (default: 446.01875M)")
    parser.add_argument("--rtl-sample-rate", type=int, default=24000, help="rtl_fm output sample rate (-s)")
    parser.add_argument("--whisper-sample-rate", type=int, default=16000, help="Whisper model sample rate (Hz)")
    parser.add_argument("--squelch", type=int, default=0, help="rtl_fm squelch level (-l). Keep 0 if output stalls with squelch.")
    parser.add_argument("--squelch-delay", type=int, default=1, help="rtl_fm squelch delay (-t). Keep this >0 so output is muted (not stopped) when squelch closes.")
    parser.add_argument("--gain", type=int, default=0, help="Tuner gain (0 = auto)")
    parser.add_argument("--model", default="tiny", help="faster-whisper model (tiny/base/small...)")
    parser.add_argument("--device", default="cpu", choices=["cpu", "cuda"], help="Inference device")
    parser.add_argument("--compute-type", default="int8", help="faster-whisper compute type (int8/float16/float32)")
    parser.add_argument("--vad-threshold", type=float, default=0.03, help="RMS threshold for voice detection")
    parser.add_argument("--hangover-ms", type=int, default=800, help="How long to keep recording after speech ends")
    parser.add_argument("--min-segment-ms", type=int, default=300, help="Ignore speech bursts shorter than this")
    parser.add_argument("--max-segment-ms", type=int, default=20000, help="Cap a single segment length")
    parser.add_argument("--debug-energy", action="store_true", help="Print RMS energy every ~1s (for tuning threshold)")
    parser.add_argument("--no-asr", action="store_true", help="Do not run Whisper (prints energy only; useful for tuning)")
    parser.add_argument("--no-kill-stale-rtl", action="store_true", help="Do not kill stale rtl_fm processes before starting")
    parser.add_argument("--live", default="data/radio/live.json", help="Write live audio status JSON here")
    parser.add_argument("--out", default="data/radio/transcripts.jsonl", help="Output JSONL path")
    parser.add_argument("--meta", default="data/radio/_last_id.txt", help="Internal last-id path")
    parser.add_argument("--rtl-fm", default="radio/run-rtl-fm.sh", help="Path to rtl_fm wrapper script")
    parser.add_argument("--ppm", type=int, default=0, help="Frequency correction (ppm)")
    parser.add_argument("--clips-dir", default="data/radio/clips", help="Directory to write WAV clips")
    parser.add_argument("--live-audio", default="data/radio/live-audio.wav", help="Rolling WAV buffer for live listening")
    parser.add_argument("--live-audio-window-s", type=float, default=3.0, help="How many seconds of audio to keep in the live buffer")
    args = parser.parse_args()

    # Load persisted config (UI writes this file); CLI args still have defaults, so config overrides.
    cfg = load_json(Path(args.config))
    channel_label = ""
    if cfg:
        # Prefer multi-channel config (channels[] + activeChannelId). Fall back to legacy fields.
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
            args.freq = str(active.get("freq", cfg.get("freq", args.freq)))
            args.ppm = int(active.get("ppm", cfg.get("ppm", args.ppm)) or 0)
            args.gain = int(active.get("gain", cfg.get("gain", args.gain)) or 0)
        else:
            args.freq = str(cfg.get("freq", args.freq))
            args.ppm = int(cfg.get("ppm", args.ppm) or 0)
            args.gain = int(cfg.get("gain", args.gain) or 0)
        # Important: rtl_fm squelch can stop PCM output entirely. We keep it off and rely on VAD threshold instead,
        # otherwise the web "live audio" meter cannot show anything.
        args.squelch = 0
        args.squelch_delay = 1
        args.vad_threshold = float(cfg.get("vadThreshold", args.vad_threshold) or args.vad_threshold)
        args.hangover_ms = int(cfg.get("hangoverMs", args.hangover_ms) or args.hangover_ms)
        args.model = str(cfg.get("model", args.model))
        args.device = str(cfg.get("device", args.device))
        args.compute_type = str(cfg.get("computeType", args.compute_type))

    if args.debug_energy:
        print("[radio] Tip: if you see 'usb_claim_interface error -6', run: ./scripts/rtl-sdr-kill.sh", flush=True)

    out_path = Path(args.out)
    meta_path = Path(args.meta)
    rtl_fm_path = Path(args.rtl_fm)
    live_path = Path(args.live)
    clips_dir = Path(args.clips_dir)
    live_audio_path = Path(args.live_audio)
    live_audio_window_s = max(0.5, float(args.live_audio_window_s or 3.0))

    if not rtl_fm_path.exists():
        print(f"Missing rtl_fm wrapper: {rtl_fm_path}", file=sys.stderr)
        return 2

    # Make sure the UI can show status even before the first transcript arrives.
    touch(out_path)
    if not meta_path.exists():
        ensure_parent(meta_path)
        meta_path.write_text("0", encoding="utf-8")
    write_json_atomic(
        live_path,
        {
            "ts": utc_now_iso(),
            "energy": 0.0,
            "threshold": float(args.vad_threshold),
            "speech": False,
            "note": "starting",
        },
    )

    print(f"[radio] Output file: {out_path}", flush=True)

    model = None
    if not args.no_asr:
        model = WhisperModel(args.model, device=args.device, compute_type=args.compute_type)

    def resample_to_whisper(audio_int16: np.ndarray) -> np.ndarray:
        src_rate = int(args.rtl_sample_rate)
        dst_rate = int(args.whisper_sample_rate)
        x = audio_int16.astype(np.float32) / 32768.0
        if src_rate == dst_rate:
            return x
        if src_rate <= 0 or dst_rate <= 0:
            return x
        dst_len = int(round(len(x) * (dst_rate / src_rate)))
        if dst_len <= 1:
            return x
        src_idx = np.arange(len(x), dtype=np.float32)
        dst_idx = np.linspace(0, len(x) - 1, dst_len, dtype=np.float32)
        return np.interp(dst_idx, src_idx, x).astype(np.float32)

    frame_ms = 100
    frames_per_chunk = int(args.rtl_sample_rate * frame_ms / 1000)
    hangover_chunks = max(1, int(args.hangover_ms / frame_ms))
    min_chunks = max(1, int(args.min_segment_ms / frame_ms))
    max_chunks = max(1, int(args.max_segment_ms / frame_ms))

    rtl_cmd = [
        str(rtl_fm_path),
        "-f",
        args.freq,
        "-M",
        "fm",
        "-s",
        str(args.rtl_sample_rate),
        "-l",
        str(args.squelch),
        "-t",
        str(args.squelch_delay),
        "-g",
        str(args.gain),
        "-",
    ]
    if args.ppm:
        rtl_cmd.extend(["-p", str(args.ppm)])

    print(f"[radio] Starting rtl_fm: {' '.join(rtl_cmd)}", flush=True)
    if not args.no_kill_stale_rtl:
        kill_stale_rtl_fm()
    proc = subprocess.Popen(
        rtl_cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        bufsize=0,
        preexec_fn=os.setsid if hasattr(os, "setsid") else None,
    )

    in_speech = False
    hangover_left = 0
    chunks: list[np.ndarray] = []
    debug_count = 0
    last_live_write = 0.0
        last_live_audio_write = 0.0
    pcm_buf = bytearray()

        # Rolling buffer for "listen live" (last N seconds). This is independent from VAD.
        live_audio_buf = np.zeros((0,), dtype=np.int16)
        live_audio_keep = int(args.rtl_sample_rate * live_audio_window_s)

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

    def stop_proc() -> None:
        if proc.poll() is not None:
            return
        try:
            if hasattr(os, "killpg"):
                os.killpg(proc.pid, signal.SIGTERM)
            else:
                proc.terminate()
        except Exception:
            try:
                proc.terminate()
            except Exception:
                pass

    def handle_signal(_signum, _frame) -> None:
        stop_proc()
        raise KeyboardInterrupt()

    for signum in (getattr(signal, "SIGINT", None), getattr(signal, "SIGTERM", None)):
        if signum is None:
            continue
        try:
            signal.signal(signum, handle_signal)
        except Exception:
            pass

    def flush_segment() -> None:
        nonlocal chunks
        if len(chunks) < min_chunks:
            chunks = []
            return

        audio_int16 = np.concatenate(chunks).astype(np.int16)
        chunks = []

        if args.no_asr:
            return

        new_id = next_id(meta_path)

        # Save audio clip for playback (browser-friendly PCM WAV)
        try:
            ensure_parent(clips_dir / "x")
            clip_path = clips_dir / f"{new_id}.wav"
            tmp = clip_path.with_suffix(".wav.tmp")
            with wave.open(str(tmp), "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(int(args.rtl_sample_rate))
                wf.writeframes(audio_int16.tobytes())
            tmp.replace(clip_path)
        except Exception:
            clip_path = None

        audio_float32 = resample_to_whisper(audio_int16).flatten()
        start = time.time()
        segments, _info = model.transcribe(audio_float32, vad_filter=False, beam_size=1)
        text = " ".join([s.text.strip() for s in segments]).strip()
        if not text:
            return

        obj = {
            "id": new_id,
            "ts": utc_now_iso(),
            "text": text,
            "seconds": round(time.time() - start, 3),
            "freq": str(args.freq),
            "channelLabel": channel_label,
        }
        if clip_path is not None:
            obj["clipUrl"] = f"/api/radio/clips/{new_id}.wav"
        append_jsonl(out_path, obj)
        print(f"[radio] {obj['ts']} #{obj['id']}: {text}", flush=True)

    try:
        while True:
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
                        "threshold": float(args.vad_threshold),
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
                            "threshold": float(args.vad_threshold),
                            "speech": False,
                            "note": "No PCM from rtl_fm yet (likely squelch/no signal). Set Squelch=0 and speak on the radio.",
                        },
                    )
                    last_live_write = now
                continue

            chunk_bytes = bytes(pcm_buf[:byte_count])
            del pcm_buf[:byte_count]
            chunk = np.frombuffer(chunk_bytes, dtype=np.int16)

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
                    print(f"[radio] energy={energy:.4f} threshold={args.vad_threshold:.4f}", flush=True)
            speech = energy >= args.vad_threshold
            now = time.time()
            if now - last_live_write >= 0.25:
                write_json_atomic(
                    live_path,
                    {
                        "ts": utc_now_iso(),
                        "energy": round(float(energy), 6),
                        "threshold": float(args.vad_threshold),
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
        print("\n[radio] Stopping...", flush=True)
    finally:
        stop_proc()
        try:
            proc.wait(timeout=2)
        except Exception:
            pass

        # Final write for live audio buffer
        try:
            write_live_audio()
        except Exception:
            pass

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
