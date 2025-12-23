#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RULE_SRC="$SCRIPT_DIR/rtl-sdr.rules"
RULE_DST="/etc/udev/rules.d/20-rtl-sdr.rules"

if [[ ! -f "$RULE_SRC" ]]; then
  echo "Missing rule file: $RULE_SRC" >&2
  exit 1
fi

echo "Installing RTL-SDR udev rule to: $RULE_DST"
sudo install -m 0644 "$RULE_SRC" "$RULE_DST"
echo "Reloading udev rules..."
sudo udevadm control --reload-rules
sudo udevadm trigger

echo
echo "Done. Unplug/replug the RTL-SDR USB dongle, then verify:"
echo "  LD_LIBRARY_PATH=$PWD/.local-rtl/lib $PWD/.local-rtl/bin/rtl_test -t"

