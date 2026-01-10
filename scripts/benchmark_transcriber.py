#!/usr/bin/env python3
"""Benchmark faster-whisper vs OpenVINO transcriber backends.

Prints:
  - model load time
  - real-time factor (RTF = wall_time / audio_duration)
  - CPU usage (best-effort)

Usage:
  ./scripts/benchmark_transcriber.py --wav /path/to/clip.wav --model tiny

Notes:
- OpenVINO benchmark requires:
    pip install openvino openvino-genai optimum-intel[openvino]
  and an exported model at models/openvino/whisper/<model>/
"""

from __future__ import annotations

import argparse
import os
import time
import wave
from pathlib import Path

import numpy as np


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


def cpu_usage_percent_during(fn, interval_s: float = 0.2):
    try:
        import psutil  # type: ignore
    except Exception:
        return None, fn()

    p = psutil.Process()
    p.cpu_percent(None)
    t0 = time.time()
    out = fn()
    # sample after
    time.sleep(interval_s)
    pct = p.cpu_percent(None)
    _ = time.time() - t0
    return pct, out


def main() -> int:
    parser = argparse.ArgumentParser(description="Benchmark transcriber backends")
    parser.add_argument("--wav", required=True, help="Input WAV file")
    parser.add_argument("--model", default="tiny", help="Whisper model name (tiny/base/small/etc)")
    parser.add_argument("--ov-device", default="AUTO", help="OpenVINO device string (default AUTO)")
    parser.add_argument("--sample-rate", type=int, default=16000, help="ASR sample rate")
    args = parser.parse_args()

    wav_path = Path(args.wav).resolve()
    if not wav_path.exists():
        print(f"Missing input wav: {wav_path}")
        return 2

    audio_i16, sr = read_wav_int16(wav_path)
    audio = resample_linear_int16_to_float32(audio_i16, sr, int(args.sample_rate)).flatten()
    duration_s = float(audio.size) / float(int(args.sample_rate) or 16000)

    print(f"Audio: {wav_path} ({duration_s:.2f}s @ {args.sample_rate}Hz)")

    # faster-whisper
    def bench_fw():
        from faster_whisper import WhisperModel  # type: ignore

        t_load0 = time.time()
        m = WhisperModel(str(args.model), device="cpu", compute_type="int8")
        load_s = time.time() - t_load0

        t0 = time.time()
        segments, _ = m.transcribe(audio, vad_filter=False, beam_size=1)
        text_parts = []
        for s in segments:
            t = (s.text or "").strip()
            if t:
                text_parts.append(t)
        wall = time.time() - t0
        return load_s, wall, " ".join(text_parts).strip()

    cpu_fw, (fw_load, fw_wall, fw_text) = cpu_usage_percent_during(bench_fw)
    print("\n=== faster-whisper ===")
    print(f"Load time: {fw_load:.3f}s")
    print(f"Wall time: {fw_wall:.3f}s")
    print(f"RTF: {fw_wall / max(0.001, duration_s):.3f}")
    print(f"CPU% (approx): {cpu_fw if cpu_fw is not None else 'psutil not installed'}")
    print(f"Text: {fw_text[:200]}{'…' if len(fw_text) > 200 else ''}")

    # OpenVINO
    def bench_ov():
        from radio.transcriber_openvino import OpenVINOTranscriber, resolve_openvino_model_dir

        os.environ.setdefault("OPENVINO_WHISPER_ROOT", str(Path("models/openvino/whisper").resolve()))
        model_dir = resolve_openvino_model_dir(str(args.model))

        t_load0 = time.time()
        tr = OpenVINOTranscriber(model_dir, device=str(args.ov_device))
        load_s = time.time() - t_load0

        t0 = time.time()
        text, _segs = tr.transcribe(audio, int(args.sample_rate), chunk_s=20.0, overlap_s=0.5)
        wall = time.time() - t0
        return load_s, wall, text

    try:
        cpu_ov, (ov_load, ov_wall, ov_text) = cpu_usage_percent_during(bench_ov)
    except Exception as e:
        print("\n=== openvino ===")
        print(f"OpenVINO benchmark failed: {e}")
        print("(Did you export a model and install openvino + openvino-genai?)")
        return 0

    print("\n=== openvino ===")
    print(f"Load time: {ov_load:.3f}s")
    print(f"Wall time: {ov_wall:.3f}s")
    print(f"RTF: {ov_wall / max(0.001, duration_s):.3f}")
    print(f"CPU% (approx): {cpu_ov if cpu_ov is not None else 'psutil not installed'}")
    print(f"Text: {ov_text[:200]}{'…' if len(ov_text) > 200 else ''}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
