#!/usr/bin/env python3
"""Export Whisper to OpenVINO IR (FP16) into models/openvino/whisper/.

This script is designed for Ubuntu 22.04 / Python 3.10+.

Recommended export path (most reliable):
  - Install Optimum Intel tooling:
      pip install -U "optimum-intel[openvino]" "transformers>=4.40" "torch" "openvino-genai" "openvino"
  - Then export with optimum-cli (uses OpenVINO Model Optimizer internally).

We keep this script as a thin wrapper so ops can do:
  ./scripts/export_whisper_to_openvino.py --model openai/whisper-base

Outputs to:
  models/openvino/whisper/<name>/openvino_encoder_model.xml (+.bin)
  models/openvino/whisper/<name>/openvino_decoder_model.xml (+.bin)
  models/openvino/whisper/<name>/openvino_decoder_with_past_model.xml (+.bin)
  plus tokenizer assets.
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path


def run(cmd: list[str]) -> int:
    proc = subprocess.run(cmd, stdout=sys.stdout, stderr=sys.stderr)
    return int(proc.returncode)


def main() -> int:
    parser = argparse.ArgumentParser(description="Export Whisper model to OpenVINO IR (FP16)")
    parser.add_argument("--model", required=True, help="HF model id or local model dir (e.g. openai/whisper-base)")
    parser.add_argument("--name", default=None, help="Output subfolder name (defaults to last path component)")
    parser.add_argument("--out", default="models/openvino/whisper", help="Output root directory")
    parser.add_argument("--fp16", action="store_true", help="Export IR weights in FP16 (default true)")
    args = parser.parse_args()

    model_id = str(args.model).strip()
    if not model_id:
        raise SystemExit("--model is required")

    name = args.name or Path(model_id).name.replace("/", "-")
    out_root = Path(args.out).resolve()
    out_dir = out_root / name
    out_dir.mkdir(parents=True, exist_ok=True)

    optimum_cli = shutil.which("optimum-cli")
    if not optimum_cli:
        print("optimum-cli not found in PATH.")
        print("Install it with: pip install -U 'optimum-intel[openvino]'", file=sys.stderr)
        return 2

    # Optimum export to OpenVINO IR (FP16). We prefer optimum-cli because it knows how to export
    # encoder/decoder/decoder_with_past + tokenizer assets.
    cmd = [
        optimum_cli,
        "export",
        "openvino",
        "--model",
        model_id,
        "--trust-remote-code",
        str(out_dir),
    ]

    # Try to request FP16. Different optimum versions use different flags.
    # We'll attempt common ones; if export fails, user can rerun with a newer optimum.
    if args.fp16 or True:
        # Order matters a bit; these are best-effort.
        cmd_try = cmd + ["--weight-format", "fp16"]
        rc = run(cmd_try)
        if rc == 0:
            print(f"Exported OpenVINO IR to: {out_dir}")
            return 0

        cmd_try = cmd + ["--precision", "FP16"]
        rc = run(cmd_try)
        if rc == 0:
            print(f"Exported OpenVINO IR to: {out_dir}")
            return 0

    rc = run(cmd)
    if rc == 0:
        print(f"Exported OpenVINO IR to: {out_dir}")
        return 0

    print("Export failed. Try upgrading optimum-intel and re-running.", file=sys.stderr)
    return int(rc or 1)


if __name__ == "__main__":
    raise SystemExit(main())
