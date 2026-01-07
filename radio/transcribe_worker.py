#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
import json
import time
import wave
from pathlib import Path

import numpy as np


def utc_now_iso() -> str:
    return dt.datetime.utcnow().replace(tzinfo=dt.timezone.utc).isoformat()


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
    parser = argparse.ArgumentParser(description="Transcribe captured walkie segments (separate worker)")
    parser.add_argument("--config", default="data/radio/config.json", help="JSON config path")
    parser.add_argument("--segments", default="data/radio/segments.jsonl", help="Segments JSONL queue")
    parser.add_argument("--out", default="data/radio/transcripts.jsonl", help="Transcripts JSONL output")
    parser.add_argument("--meta", default="data/radio/_last_transcribed_id.txt", help="Last transcribed id")
    parser.add_argument("--whisper-sample-rate", type=int, default=16000, help="Whisper model sample rate")
    parser.add_argument("--poll-ms", type=int, default=350, help="How often to poll for new segments")
    args = parser.parse_args()

    cfg_path = Path(args.config)
    seg_path = Path(args.segments)
    out_path = Path(args.out)
    meta_path = Path(args.meta)

    # Lazy import so capture can run without ASR deps.
    try:
        from faster_whisper import WhisperModel  # type: ignore
    except Exception as e:
        print(f"[radio-transcriber] Missing faster_whisper: {e}")
        print("[radio-transcriber] Install deps and restart this worker.")
        return 2

    model_name = "tiny"
    device = "cpu"
    compute_type = "int8"

    # Initial config
    cfg = load_json(cfg_path)
    if isinstance(cfg, dict):
        model_name = str(cfg.get("model") or model_name)
        device = str(cfg.get("device") or device)
        compute_type = str(cfg.get("computeType") or compute_type)

    print(f"[radio-transcriber] Loading model {model_name} ({device}/{compute_type})", flush=True)
    model = WhisperModel(model_name, device=device, compute_type=compute_type)

    last_cfg_mtime = 0.0
    last_cfg_check = 0.0

    last_id = read_last_id(meta_path)
    print(f"[radio-transcriber] Starting at last_id={last_id}", flush=True)

    while True:
        # Hot-reload model settings when config changes.
        now = time.time()
        if now - last_cfg_check >= 1.0:
            last_cfg_check = now
            try:
                st = cfg_path.stat()
                m = float(st.st_mtime)
            except Exception:
                m = 0.0

            if m > last_cfg_mtime:
                last_cfg_mtime = m
                cfg2 = load_json(cfg_path)
                if isinstance(cfg2, dict):
                    next_model = str(cfg2.get("model") or model_name)
                    next_device = str(cfg2.get("device") or device)
                    next_compute = str(cfg2.get("computeType") or compute_type)
                    if (next_model, next_device, next_compute) != (model_name, device, compute_type):
                        model_name, device, compute_type = next_model, next_device, next_compute
                        print(f"[radio-transcriber] Reloading model {model_name} ({device}/{compute_type})", flush=True)
                        model = WhisperModel(model_name, device=device, compute_type=compute_type)

        items = iter_jsonl_new(seg_path, last_id)
        if not items:
            time.sleep(max(0.05, int(args.poll_ms) / 1000.0))
            continue

        for seg in items:
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
                audio_float32 = resample_linear_int16_to_float32(audio_int16, src_sr, int(args.whisper_sample_rate)).flatten()

                start = time.time()
                segments, _info = model.transcribe(audio_float32, vad_filter=False, beam_size=1)
                text = " ".join([s.text.strip() for s in segments]).strip()
                if not text:
                    last_id = seg_id
                    write_last_id(meta_path, last_id)
                    continue

                obj = {
                    "id": seg_id,
                    "ts": utc_now_iso(),
                    "text": text,
                    "seconds": round(time.time() - start, 3),
                    "freq": str(seg.get("freq") or ""),
                    "channelLabel": str(seg.get("channelLabel") or ""),
                }
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


if __name__ == "__main__":
    raise SystemExit(main())
