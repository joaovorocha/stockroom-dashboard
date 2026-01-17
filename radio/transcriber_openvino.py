#!/usr/bin/env python3
from __future__ import annotations

import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np


@dataclass
class TranscriptSegment:
    start: float
    end: float
    text: str


class OpenVINOTranscriber:
    """OpenVINO Whisper transcriber.

    Implementation strategy:
    - Prefer `openvino_genai.WhisperPipeline` for decoding (robust + maintained).
    - Still uses OpenVINO Runtime Core + compile_model(..., "AUTO") to:
        - satisfy required runtime usage
        - log the selected execution device(s)

    Model layout (expected, exported by optimum-cli openvino export):
      <model_dir>/openvino_encoder_model.xml (+ .bin)
      <model_dir>/openvino_decoder_model.xml (+ .bin)
      <model_dir>/openvino_decoder_with_past_model.xml (+ .bin) [optional]
      plus tokenizer/detokenizer assets.
    """

    def __init__(
        self,
        model_dir: str | Path,
        *,
        device: str = "AUTO",
        language: Optional[str] = None,
        task: str = "transcribe",
        verbose: bool = True,
    ) -> None:
        self.model_dir = Path(model_dir)
        # Prefer explicit priority ordering when available.
        # Keep the default requested behavior as "AUTO" but allow callers to pass
        # e.g. "AUTO:NPU,GPU,CPU".
        self.device = (device or "AUTO").strip() or "AUTO"
        self.language = language
        self.task = task
        self.verbose = verbose

        # Lazy imports: if OpenVINO isn't installed, caller can fall back.
        try:
            from openvino.runtime import Core  # type: ignore
        except Exception as e:
            raise RuntimeError(f"OpenVINO runtime not available: {e}")

        self._Core = Core

        # Verify basic model presence early.
        enc_xml = self.model_dir / "openvino_encoder_model.xml"
        if not enc_xml.exists():
            raise FileNotFoundError(f"Missing OpenVINO Whisper encoder IR: {enc_xml}")

        # Compile *one* model (encoder) with Core so we can log execution devices.
        # Use the requested device to reflect actual target (e.g. NPU).
        # WhisperPipeline will handle encoder/decoder compilation internally.
        core = self._Core()
        plugins_xml = os.environ.get("OPENVINO_PLUGINS_XML")
        if plugins_xml:
            try:
                core.register_plugins(plugins_xml)
                if self.verbose:
                    print(f"[radio-transcriber] OpenVINO plugins loaded from {plugins_xml}", flush=True)
            except Exception as e:
                if self.verbose:
                    print(f"[radio-transcriber] OpenVINO plugins load failed: {e}", flush=True)

        # Explicitly register NPU/GPU plugins if available (ignore if already registered).
        plugin_dir = os.environ.get("OPENVINO_PLUGIN_PATH")
        if plugin_dir:
            try:
                plugin_path = Path(plugin_dir)
                npu_lib = plugin_path / "libopenvino_intel_npu_plugin.so"
                gpu_lib = plugin_path / "libopenvino_intel_gpu_plugin.so"
                if npu_lib.exists():
                    try:
                        core.register_plugin(str(npu_lib), "NPU")
                        if self.verbose:
                            print(f"[radio-transcriber] OpenVINO NPU plugin registered: {npu_lib}", flush=True)
                    except Exception as e:
                        if self.verbose:
                            print(f"[radio-transcriber] OpenVINO NPU plugin registration failed: {e}", flush=True)
                if gpu_lib.exists():
                    try:
                        core.register_plugin(str(gpu_lib), "GPU")
                        if self.verbose:
                            print(f"[radio-transcriber] OpenVINO GPU plugin registered: {gpu_lib}", flush=True)
                    except Exception as e:
                        if self.verbose:
                            print(f"[radio-transcriber] OpenVINO GPU plugin registration failed: {e}", flush=True)
            except Exception as e:
                if self.verbose:
                    print(f"[radio-transcriber] OpenVINO plugin fallback failed: {e}", flush=True)
        try:
            ov_model = core.read_model(str(enc_xml))
            try:
                compiled = core.compile_model(ov_model, self.device)
            except Exception as e:
                if self.verbose:
                    print(f"[radio-transcriber] OpenVINO device probe failed on {self.device}: {e}", flush=True)
                compiled = core.compile_model(ov_model, "AUTO")

            selected = None
            try:
                import openvino.properties as props  # type: ignore

                selected = compiled.get_property(props.execution_devices)
            except Exception:
                # Fallback property key used by some versions
                try:
                    selected = compiled.get_property("EXECUTION_DEVICES")
                except Exception:
                    selected = None

            if self.verbose:
                if selected is None:
                    print("[radio-transcriber] OpenVINO device selected: (unknown)", flush=True)
                else:
                    print(f"[radio-transcriber] OpenVINO device selected: {selected}", flush=True)
        except Exception as e:
            # If AUTO compilation fails here, it's still worth trying the pipeline,
            # but we want a clear log line for ops.
            if self.verbose:
                print(f"[radio-transcriber] OpenVINO device probe failed: {e}", flush=True)

        # Build Whisper pipeline for actual generation.
        try:
            import openvino_genai as ov_genai  # type: ignore
        except Exception as e:
            raise RuntimeError(
                "openvino_genai is required for OpenVINO Whisper decoding. "
                f"Install it, or set TRANSCRIBER_BACKEND=faster-whisper. Error: {e}"
            )

        # WhisperPipeline accepts either device like "CPU"/"GPU"/"NPU" or "AUTO".
        # For best results on Core Ultra, callers should pass: "AUTO:NPU,GPU,CPU".
        self._pipe = ov_genai.WhisperPipeline(str(self.model_dir), device=self.device)

        if self.verbose:
            print(f"[radio-transcriber] OpenVINO backend ready (device={self.device})", flush=True)

    def transcribe(
        self,
        audio_float32: np.ndarray,
        sample_rate: int,
        *,
        chunk_s: float = 20.0,
        overlap_s: float = 0.5,
    ) -> Tuple[str, List[Dict[str, Any]]]:
        """Transcribe audio, returning (text, segments).

        - Accepts float32 mono samples.
        - Performs chunking to support near-realtime / long clips.
        """
        x = np.asarray(audio_float32, dtype=np.float32).flatten()
        if x.size == 0:
            return "", []
        sr = int(sample_rate) if int(sample_rate or 0) > 0 else 16000

        chunk_samples = int(max(1, round(float(chunk_s) * sr)))
        overlap_samples = int(max(0, round(float(overlap_s) * sr)))
        step = max(1, chunk_samples - overlap_samples)

        def run_once(piece: np.ndarray, t0_s: float) -> Tuple[str, List[Dict[str, Any]]]:
            # openvino_genai expects a list of floats (raw speech)
            start = time.time()
            res = self._pipe.generate(piece.astype(np.float32).tolist())

            # The GenAI API returns a results object; text usually available as .texts[0].
            text = ""
            try:
                text = (res.texts[0] or "").strip()
            except Exception:
                try:
                    text = (getattr(res, "text", "") or "").strip()
                except Exception:
                    text = ""

            segs: List[Dict[str, Any]] = []
            # Best-effort timestamp extraction (API surface varies). If unavailable,
            # return a single segment covering the whole chunk.
            extracted = False
            for attr in ("chunks", "segments"):
                try:
                    items = getattr(res, attr)
                except Exception:
                    items = None
                if items:
                    try:
                        for s in items:
                            st = float(getattr(s, "start", getattr(s, "start_ts", 0.0)) or 0.0)
                            en = float(getattr(s, "end", getattr(s, "end_ts", 0.0)) or 0.0)
                            tx = (getattr(s, "text", "") or "").strip()
                            if not tx:
                                continue
                            segs.append({"start": round(t0_s + st, 3), "end": round(t0_s + en, 3), "text": tx})
                        extracted = len(segs) > 0
                    except Exception:
                        extracted = False
                if extracted:
                    break

            if not extracted and text:
                dur_s = float(piece.size) / float(sr)
                segs = [{"start": round(t0_s, 3), "end": round(t0_s + dur_s, 3), "text": text}]

            _ = time.time() - start
            return text, segs

        if x.size <= chunk_samples:
            return run_once(x, 0.0)

        out_text_parts: List[str] = []
        out_segments: List[Dict[str, Any]] = []

        i = 0
        n = x.size
        while i < n:
            j = min(n, i + chunk_samples)
            piece = x[i:j]
            t0_s = float(i) / float(sr)
            txt, segs = run_once(piece, t0_s)
            if txt:
                out_text_parts.append(txt)
            if segs:
                out_segments.extend(segs)
            if j >= n:
                break
            i += step

        return " ".join(out_text_parts).strip(), out_segments

    def transcribe_legacy(self, audio_float32: np.ndarray, sample_rate: int, *, chunk_s: float = 20.0, overlap_s: float = 0.5):
        """Compatibility: behave like faster-whisper `WhisperModel.transcribe`.

        Returns: (segments_iterable, info)
        Where each segment has `.text` so existing code paths can consume it.
        """

        text, segs = self.transcribe(audio_float32, sample_rate, chunk_s=chunk_s, overlap_s=overlap_s)

        class _Seg:
            def __init__(self, text: str, start: float, end: float):
                self.text = text
                self.start = start
                self.end = end

        if segs:
            segments = [_Seg(s.get("text", ""), float(s.get("start", 0.0)), float(s.get("end", 0.0))) for s in segs]
        elif text:
            dur = float(len(audio_float32)) / float(sample_rate or 16000)
            segments = [_Seg(text, 0.0, dur)]
        else:
            segments = []

        return (segments, {})


def resolve_openvino_model_dir(model_name: str | None = None) -> Path:
    """Resolve OpenVINO model directory.

    Priority:
      1) OPENVINO_WHISPER_MODEL_DIR (explicit)
      2) OPENVINO_WHISPER_ROOT + <model_name> subdir if exists
      3) ./models/openvino/whisper (+ optional <model_name>)
    """
    explicit = os.environ.get("OPENVINO_WHISPER_MODEL_DIR")
    if explicit:
        return Path(explicit).expanduser().resolve()

    root = os.environ.get("OPENVINO_WHISPER_ROOT")
    base = Path(root).expanduser().resolve() if root else (Path(__file__).resolve().parents[1] / "models" / "openvino" / "whisper")

    if model_name:
        cand = base / str(model_name)
        if cand.exists():
            return cand

    return base
