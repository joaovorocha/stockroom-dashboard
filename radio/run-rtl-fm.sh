#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

BIN="$ROOT_DIR/.local-rtl/bin/rtl_fm"
LIB_DIR="$ROOT_DIR/.local-rtl/lib"

if [[ ! -x "$BIN" ]]; then
  echo "Missing rtl_fm at: $BIN" >&2
  exit 1
fi

export LD_LIBRARY_PATH="${LIB_DIR}${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
exec "$BIN" "$@"

