#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

BIN="$ROOT_DIR/.local-rtl/bin/rtl_sdr"
LIB_DIR="$ROOT_DIR/.local-rtl/lib"

if [[ ! -x "$BIN" ]]; then
  echo "Missing rtl_sdr at: $BIN" >&2
  exit 1
fi

export LD_LIBRARY_PATH="${LIB_DIR}${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

# --- Auto-recovery / auto-exclusive access ---
# The RTL-SDR dongle can only be claimed by ONE process at a time.
# If any other rtl_* tool is running, rtl_sdr will fail with usb_claim_interface error -6.

kill_conflicting_rtl_processes() {
  local pids=""
  # Prefer killing only the repo-bundled rtl tools.
  pids="$(pgrep -f "$ROOT_DIR/.local-rtl/bin/rtl_" || true)"
  # Also catch system-installed rtl tools if any.
  pids="$pids $(pgrep -f "(^|/)rtl_(sdr|fm|tcp|power)(\\s|$)" || true)"

  # Deduplicate + remove empty.
  pids="$(echo "$pids" | tr ' ' '\n' | awk 'NF{print $0}' | sort -n | uniq)"

  # Do not kill our own shell process.
  pids="$(echo "$pids" | awk -v self="$$" '$1 != self {print $1}')"

  if [[ -z "$pids" ]]; then
    return 0
  fi

  echo "[run-rtl-sdr] Killing conflicting RTL processes: $(echo "$pids" | tr '\n' ' ')" >&2
  while read -r pid; do
    [[ -z "$pid" ]] && continue
    kill -TERM "$pid" 2>/dev/null || true
  done <<< "$pids"

  sleep 0.25

  while read -r pid; do
    [[ -z "$pid" ]] && continue
    kill -KILL "$pid" 2>/dev/null || true
  done <<< "$pids"
}

unload_rtl_dvb_modules() {
  # If the kernel DVB driver grabs the dongle, librtlsdr can't claim it.
  # Unloading requires root; we try best-effort.
  local cmd="modprobe -r dvb_usb_rtl28xxu rtl2832 rtl2830 2>/dev/null || true"
  if [[ "$(id -u)" == "0" ]]; then
    echo "[run-rtl-sdr] Unloading DVB RTL modules (root)…" >&2
    bash -lc "$cmd" || true
    return 0
  fi
  if command -v sudo >/dev/null 2>&1; then
    # -n = non-interactive; if not permitted, it will just fail and we move on.
    echo "[run-rtl-sdr] Attempting to unload DVB RTL modules via sudo…" >&2
    sudo -n bash -lc "$cmd" || true
  fi
}

kill_conflicting_rtl_processes || true
unload_rtl_dvb_modules || true

exec "$BIN" "$@"
