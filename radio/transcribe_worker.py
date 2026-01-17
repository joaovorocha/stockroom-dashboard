#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import signal
import subprocess
import time
import wave
from pathlib import Path
import shutil

import numpy as np


_stop_requested = False


def _handle_stop_signal(_signum, _frame) -> None:
    global _stop_requested
    _stop_requested = True


def utc_now_iso() -> str:
    # datetime.utcnow() is deprecated in newer Python; use timezone-aware UTC.
    return dt.datetime.now(dt.timezone.utc).isoformat()


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def append_jsonl(path: Path, obj: dict) -> None:
    ensure_parent(path)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(obj, ensure_ascii=False) + "\n")
        f.flush()


def safe_int(v, default=0) -> int:
    try:
        return int(v)
    except Exception:
        return int(default)


def load_json(path: Path) -> dict:
    try:
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return {}


def read_last_id(path: Path) -> int:
    try:
        if path.exists():
            return int(path.read_text(encoding="utf-8").strip() or "0")
    except Exception:
        return 0
    return 0


def write_last_id(path: Path, n: int) -> None:
    ensure_parent(path)
    path.write_text(str(int(n)), encoding="utf-8")


def read_wav_int16(path: Path) -> tuple[np.ndarray, int]:
    with wave.open(str(path), "rb") as wf:
        sr = int(wf.getframerate())
        frames = wf.readframes(wf.getnframes())
    x = np.frombuffer(frames, dtype=np.int16)
    return x, sr


def apply_ffmpeg_conditioning(
    audio_int16: np.ndarray,
    src_sr: int,
    dst_sr: int,
    cfg: dict,
    *,
    ffmpeg_path: str | None = None,
) -> tuple[np.ndarray, int] | None:
    """Apply FFmpeg audio conditioning filters to int16 PCM.

    References:
    - https://ffmpeg.org/ffmpeg-filters.html#highpass
    - https://ffmpeg.org/ffmpeg-filters.html#lowpass
    - https://ffmpeg.org/ffmpeg-filters.html#acompressor
    - https://ffmpeg.org/ffmpeg-filters.html#alimiter
    """
    if audio_int16.size == 0:
        return None
    if src_sr <= 0 or dst_sr <= 0:
        return None

    ffmpeg_bin = ffmpeg_path or shutil.which("ffmpeg")
    if not ffmpeg_bin:
        return None

    hp = float(cfg.get("highpassHz", 200) or 200)
    lp = float(cfg.get("lowpassHz", 3800) or 3800)
    comp = cfg.get("compressor", {}) if isinstance(cfg.get("compressor"), dict) else {}
    lim = cfg.get("limiter", {}) if isinstance(cfg.get("limiter"), dict) else {}

    comp_threshold = float(comp.get("threshold", 0.125) or 0.125)
    comp_ratio = float(comp.get("ratio", 4) or 4)
    comp_attack = float(comp.get("attackMs", 10) or 10)
    comp_release = float(comp.get("releaseMs", 200) or 200)
    comp_makeup = float(comp.get("makeup", 2) or 2)

    lim_limit = float(lim.get("limit", 0.9) or 0.9)
    lim_attack = float(lim.get("attackMs", 5) or 5)
    lim_release = float(lim.get("releaseMs", 50) or 50)

    filters = [
        f"highpass=f={hp}",
        f"lowpass=f={lp}",
        f"acompressor=threshold={comp_threshold}:ratio={comp_ratio}:attack={comp_attack}:release={comp_release}:makeup={comp_makeup}",
        f"alimiter=limit={lim_limit}:attack={lim_attack}:release={lim_release}",
    ]

    cmd = [
        ffmpeg_bin,
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "s16le",
        "-ar",
        str(int(src_sr)),
        "-ac",
        "1",
        "-i",
        "pipe:0",
        "-af",
        ",".join(filters),
        "-ar",
        str(int(dst_sr)),
        "-ac",
        "1",
        "-f",
        "s16le",
        "pipe:1",
    ]

    try:
        proc = subprocess.run(cmd, input=audio_int16.tobytes(), capture_output=True, check=False)
    except Exception:
        return None
    if proc.returncode != 0 or not proc.stdout:
        return None
    out = np.frombuffer(proc.stdout, dtype=np.int16)
    if out.size == 0:
        return None
    return out, int(dst_sr)


def resample_linear_int16_to_float32(audio_int16: np.ndarray, src_rate: int, dst_rate: int) -> np.ndarray:
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


def transcribe_float32_chunked(model, audio_float32: np.ndarray, sample_rate: int, *, chunk_s: float = 20.0, overlap_s: float = 0.5) -> str:
    if audio_float32 is None:
        return ""
    audio_float32 = np.asarray(audio_float32, dtype=np.float32).flatten()
    if audio_float32.size == 0:
        return ""
    if sample_rate <= 0:
        sample_rate = 16000

    chunk_samples = int(max(1, round(float(chunk_s) * sample_rate)))
    overlap_samples = int(max(0, round(float(overlap_s) * sample_rate)))
    if chunk_samples <= 0:
        chunk_samples = sample_rate * 20

    def run_once(x: np.ndarray) -> str:
        segments, _info = model.transcribe(x, vad_filter=False, beam_size=1)
        parts = []
        for s in segments:
            try:
                t = (s.text or "").strip()
            except Exception:
                t = ""
            if t:
                parts.append(t)
        return " ".join(parts).strip()

    if audio_float32.size <= chunk_samples:
        return run_once(audio_float32)

    out_parts = []
    i = 0
    n = audio_float32.size
    step = max(1, chunk_samples - overlap_samples)
    while i < n:
        j = min(n, i + chunk_samples)
        piece = audio_float32[i:j]
        txt = run_once(piece)
        if txt:
            out_parts.append(txt)
        if j >= n:
            break
        i += step
    return " ".join(out_parts).strip()


def transcribe_float32_chunked_with_segments(model, audio_float32: np.ndarray, sample_rate: int, *, chunk_s: float = 20.0, overlap_s: float = 0.5) -> tuple[str, list[dict]]:
    """Chunked transcription returning (full_text, segments).

    Segment format: {start: seconds, end: seconds, text: str}
    """
    if audio_float32 is None:
        return "", []
    audio_float32 = np.asarray(audio_float32, dtype=np.float32).flatten()
    if audio_float32.size == 0:
        return "", []
    if sample_rate <= 0:
        sample_rate = 16000

    chunk_samples = int(max(1, round(float(chunk_s) * sample_rate)))
    overlap_samples = int(max(0, round(float(overlap_s) * sample_rate)))
    step = max(1, chunk_samples - overlap_samples)

    def run_once(x: np.ndarray, offset_s: float) -> tuple[str, list[dict]]:
        segments, _info = model.transcribe(x, vad_filter=False, beam_size=1)
        parts = []
        out = []
        for s in segments:
            try:
                t = (s.text or "").strip()
            except Exception:
                t = ""
            if not t:
                continue
            parts.append(t)
            try:
                st = float(getattr(s, "start", 0.0) or 0.0)
                en = float(getattr(s, "end", 0.0) or 0.0)
            except Exception:
                st, en = 0.0, 0.0
            out.append({"start": round(offset_s + st, 3), "end": round(offset_s + en, 3), "text": t})
        return " ".join(parts).strip(), out

    if audio_float32.size <= chunk_samples:
        return run_once(audio_float32, 0.0)

    out_text_parts = []
    out_segments = []
    i = 0
    n = audio_float32.size
    while i < n:
        j = min(n, i + chunk_samples)
        piece = audio_float32[i:j]
        txt, segs = run_once(piece, float(i) / float(sample_rate))
        if txt:
            out_text_parts.append(txt)
        if segs:
            out_segments.extend(segs)
        if j >= n:
            break
        i += step

    return " ".join(out_text_parts).strip(), out_segments


def iter_jsonl_new(path: Path, after_id: int) -> list[dict]:
    if not path.exists():
        return []
    out = []
    try:
        # Read tail-ish; segments is usually small.
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                obj = json.loads(line)
            except Exception:
                continue
            if safe_int(obj.get("id"), 0) <= after_id:
                continue
            out.append(obj)
    except Exception:
        return []

    out.sort(key=lambda o: safe_int(o.get("id"), 0))
    return out


def main() -> int:
    # Graceful shutdown under PM2 stop/restart (avoid scary KeyboardInterrupt tracebacks).
    try:
        signal.signal(signal.SIGTERM, _handle_stop_signal)
        signal.signal(signal.SIGINT, _handle_stop_signal)
    except Exception:
        pass

    parser = argparse.ArgumentParser(description="Transcribe captured walkie segments (separate worker)")
    parser.add_argument("--config", default="data/radio/config.json", help="JSON config path")
    parser.add_argument("--segments", default="data/radio/segments.jsonl", help="Segments JSONL queue")
    parser.add_argument("--out", default="data/radio/transcripts.jsonl", help="Transcripts JSONL output")
    parser.add_argument("--meta", default="data/radio/_last_transcribed_id.txt", help="Last transcribed id")
    parser.add_argument("--whisper-sample-rate", type=int, default=16000, help="Whisper model sample rate")
    parser.add_argument("--poll-ms", type=int, default=350, help="How often to poll for new segments")
    args = parser.parse_args()

    cfg_path = Path(args.config)
    live_cfg_path = cfg_path.with_name(cfg_path.stem + ".live" + cfg_path.suffix)
    seg_path = Path(args.segments)
    out_path = Path(args.out)
    meta_path = Path(args.meta)

    # Be a good citizen: keep this worker from starving the capture/server under load.
    try:
        if hasattr(os, "nice"):
            os.nice(10)
    except Exception:
        pass

    # Reduce thread fan-out in BLAS/OpenMP stacks (best-effort).
    for k in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS", "NUMEXPR_NUM_THREADS"):
        os.environ.setdefault(k, "1")

    backend_env = (os.environ.get("TRANSCRIBER_BACKEND") or "").strip().lower()
    ov_device = (os.environ.get("OPENVINO_DEVICE") or "AUTO:NPU,GPU,CPU").strip() or "AUTO:NPU,GPU,CPU"

    # Default early to avoid any "referenced before assignment" edge cases during startup.
    backend = "faster-whisper"

    # We'll decide which deps to import after reading the config (env overrides config).
    WhisperModel = None

    model_name = "tiny"
    device = "cpu"
    compute_type = "int8"
    conditioning_cfg = {}
    conditioning_enabled = True
    ffmpeg_path = os.environ.get("FFMPEG_PATH")

    def load_effective_config() -> dict:
        cfg = load_json(live_cfg_path) if live_cfg_path.exists() else {}
        if isinstance(cfg, dict) and cfg:
            return cfg
        cfg2 = load_json(cfg_path)
        return cfg2 if isinstance(cfg2, dict) else {}

    # Initial config
    cfg = load_effective_config()
    if isinstance(cfg, dict):
        model_name = str(cfg.get("model") or model_name)
        device = str(cfg.get("device") or device)
        compute_type = str(cfg.get("computeType") or compute_type)
        conditioning_cfg = cfg.get("audioConditioning", {}) if isinstance(cfg.get("audioConditioning"), dict) else {}
        conditioning_enabled = bool(conditioning_cfg.get("enabled", True))

    backend_cfg = ""
    if isinstance(cfg, dict):
        backend_cfg = str(cfg.get("transcriberBackend") or "").strip().lower()
    backend = (backend_env or backend_cfg or "faster-whisper").strip().lower()
    if backend not in ("openvino", "faster-whisper"):
        print(f"[radio-transcriber] Unknown backend '{backend}', defaulting to faster-whisper", flush=True)
        backend = "faster-whisper"

    print(f"[radio-transcriber] Backend: {backend}", flush=True)

    # Lazy import so capture can run without ASR deps.
    if backend != "openvino":
        try:
            from faster_whisper import WhisperModel  # type: ignore
        except Exception as e:
            print(f"[radio-transcriber] Missing faster_whisper: {e}")
            print("[radio-transcriber] Install deps and restart this worker.")
            return 2

    model = None
    backoff_s = 2.0
    while model is None:
        try:
            if backend == "openvino":
                from radio.transcriber_openvino import OpenVINOTranscriber, resolve_openvino_model_dir

                model_dir = resolve_openvino_model_dir(model_name)
                print(f"[radio-transcriber] Loading OpenVINO model from {model_dir} (device={ov_device})", flush=True)
                model = OpenVINOTranscriber(model_dir, device=ov_device)
            else:
                print(f"[radio-transcriber] Loading model {model_name} ({device}/{compute_type})", flush=True)
                if WhisperModel is None:
                    raise RuntimeError("faster-whisper backend selected but WhisperModel is unavailable")
                model = WhisperModel(model_name, device=device, compute_type=compute_type)
        except Exception as e:
            # Don't crash the overall system if ASR load fails under CPU/RAM pressure.
            print(f"[radio-transcriber] Model load failed: {e}", flush=True)
            if backend == "openvino":
                print("[radio-transcriber] OpenVINO failed, falling back to CPU transcriber", flush=True)
                backend = "faster-whisper"
                try:
                    from faster_whisper import WhisperModel as _FW  # type: ignore
                    WhisperModel = _FW
                except Exception as e2:
                    print(f"[radio-transcriber] Missing faster_whisper after fallback: {e2}")
                    time.sleep(backoff_s)
                    backoff_s = min(60.0, backoff_s * 1.7)
                    continue
            time.sleep(backoff_s)
            backoff_s = min(60.0, backoff_s * 1.7)

    last_cfg_mtime = 0.0
    last_cfg_live_mtime = 0.0
    last_cfg_check = 0.0

    last_id = read_last_id(meta_path)
    print(f"[radio-transcriber] Starting at last_id={last_id}", flush=True)

    while True:
        if _stop_requested:
            return 0
        # Hot-reload model settings when config changes.
        now = time.time()
        if now - last_cfg_check >= 1.0:
            last_cfg_check = now
            try:
                m_saved = float(cfg_path.stat().st_mtime) if cfg_path.exists() else 0.0
            except Exception:
                m_saved = 0.0
            try:
                m_live = float(live_cfg_path.stat().st_mtime) if live_cfg_path.exists() else 0.0
            except Exception:
                m_live = 0.0

            if m_saved <= last_cfg_mtime and m_live <= last_cfg_live_mtime:
                pass
            else:
                last_cfg_mtime = m_saved
                last_cfg_live_mtime = m_live
                cfg2 = load_effective_config()
                if isinstance(cfg2, dict):
                    next_model = str(cfg2.get("model") or model_name)
                    next_device = str(cfg2.get("device") or device)
                    next_compute = str(cfg2.get("computeType") or compute_type)
                    if (next_model, next_device, next_compute) != (model_name, device, compute_type):
                        model_name, device, compute_type = next_model, next_device, next_compute
                        if backend == "openvino":
                            from radio.transcriber_openvino import OpenVINOTranscriber, resolve_openvino_model_dir

                            model_dir = resolve_openvino_model_dir(model_name)
                            print(f"[radio-transcriber] Reloading OpenVINO model from {model_dir} (device={ov_device})", flush=True)
                            try:
                                model = OpenVINOTranscriber(model_dir, device=ov_device)
                            except Exception as e:
                                print(f"[radio-transcriber] OpenVINO reload failed: {e}", flush=True)
                                print("[radio-transcriber] OpenVINO failed, falling back to CPU transcriber", flush=True)
                                backend = "faster-whisper"
                                try:
                                    from faster_whisper import WhisperModel as _FW  # type: ignore
                                    WhisperModel = _FW
                                    model = WhisperModel(model_name, device="cpu", compute_type=compute_type)
                                except Exception as e2:
                                    print(f"[radio-transcriber] Fallback load failed: {e2}", flush=True)
                        else:
                            print(f"[radio-transcriber] Reloading model {model_name} ({device}/{compute_type})", flush=True)
                            try:
                                if WhisperModel is None:
                                    raise RuntimeError("WhisperModel unavailable")
                                model = WhisperModel(model_name, device=device, compute_type=compute_type)
                            except Exception as e:
                                print(f"[radio-transcriber] Model reload failed: {e}", flush=True)
                            # Keep running with the previous model if reload fails.

        items = iter_jsonl_new(seg_path, last_id)
        if not items:
            # Sleep in small increments so SIGTERM/SIGINT is respected quickly.
            total_sleep = max(0.05, int(args.poll_ms) / 1000.0)
            slept = 0.0
            while slept < total_sleep and not _stop_requested:
                dt_s = min(0.25, total_sleep - slept)
                time.sleep(dt_s)
                slept += dt_s
            continue

        for seg in items:
            if _stop_requested:
                return 0
            seg_id = safe_int(seg.get("id"), 0)
            clip_path_raw = str(seg.get("clipPath") or "").strip()
            if seg_id <= last_id:
                continue
            if not clip_path_raw:
                last_id = seg_id
                write_last_id(meta_path, last_id)
                continue

            clip_path = Path(clip_path_raw)
            if not clip_path.exists():
                last_id = seg_id
                write_last_id(meta_path, last_id)
                continue

            try:
                audio_int16, src_sr = read_wav_int16(clip_path)
                if conditioning_enabled:
                    conditioned = apply_ffmpeg_conditioning(
                        audio_int16,
                        int(src_sr),
                        int(args.whisper_sample_rate),
                        conditioning_cfg,
                        ffmpeg_path=ffmpeg_path,
                    )
                else:
                    conditioned = None

                if conditioned is not None:
                    audio_int16, src_sr = conditioned

                audio_float32 = resample_linear_int16_to_float32(audio_int16, src_sr, int(args.whisper_sample_rate)).flatten()

                start = time.time()
                if model is None:
                    raise RuntimeError("ASR model not loaded")
                # Chunk long clips to avoid a single huge transcribe call that can appear to hang.
                duration_s = float(audio_float32.size) / float(int(args.whisper_sample_rate) or 16000)
                if duration_s > 25:
                    print(f"[radio-transcriber] #{seg_id}: long clip {duration_s:.1f}s, chunking…", flush=True)
                segs_out = []
                if backend == "openvino":
                    text, segs_out = model.transcribe(audio_float32, int(args.whisper_sample_rate), chunk_s=20.0, overlap_s=0.5)
                else:
                    # Keep legacy behavior (text-only) but also emit segments for timestamps.
                    text, segs_out = transcribe_float32_chunked_with_segments(model, audio_float32, int(args.whisper_sample_rate), chunk_s=20.0, overlap_s=0.5)
                if not text:
                    last_id = seg_id
                    write_last_id(meta_path, last_id)
                    continue

                obj = {
                    "id": seg_id,
                    "ts": utc_now_iso(),
                    "text": text,
                    "seconds": round(time.time() - start, 3),
                    "backend": backend,
                    "freq": str(seg.get("freq") or ""),
                    "channelLabel": str(seg.get("channelLabel") or ""),
                }
                if segs_out:
                    obj["segments"] = segs_out
                clip_url = seg.get("clipUrl")
                if clip_url:
                    obj["clipUrl"] = str(clip_url)

                append_jsonl(out_path, obj)
                last_id = seg_id
                write_last_id(meta_path, last_id)
                print(f"[radio-transcriber] #{seg_id}: {text}", flush=True)
            except Exception as e:
                # Don't get stuck forever on one bad clip.
                print(f"[radio-transcriber] Error on id={seg_id}: {e}", flush=True)
                last_id = seg_id
                write_last_id(meta_path, last_id)

    return 0


def _main_entry() -> int:
    try:
        return main()
    except KeyboardInterrupt:
        # Treat Ctrl+C/SIGINT as a clean exit (PM2 stop/restart).
        return 0


if __name__ == "__main__":
    raise SystemExit(_main_entry())
