#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BLACKLIST_DST="/etc/modprobe.d/rtlsdr-blacklist.conf"

mods_loaded() {
  lsmod | awk '{print $1}' | grep -E '^(rtl2832_sdr|dvb_usb_rtl28xxu|dvb_usb_v2|rtl2832|r820t|dvb_core|rc_core)$' || true
}

echo "Checking for conflicting DVB kernel modules..."
loaded="$(mods_loaded | tr '\n' ' ' | xargs || true)"
if [[ -z "$loaded" ]]; then
  echo "OK: no conflicting DVB/RTL modules appear to be loaded."
else
  echo "Found loaded modules: $loaded"
fi

echo
echo "This script will:"
echo "  1) write a modprobe blacklist ($BLACKLIST_DST)"
echo "  2) attempt to unload the conflicting modules (modprobe -r)"
echo "  3) suggest unplug/replug or reboot"
echo

# Prompt for sudo once
sudo -v

echo "Writing blacklist to $BLACKLIST_DST ..."
sudo tee "$BLACKLIST_DST" >/dev/null <<'EOF'
# Prevent RTL-SDR DVB/V4L kernel drivers from claiming the dongle.
# Required for rtl_power/rtl_fm/librtlsdr usage.
blacklist dvb_usb_rtl28xxu
blacklist rtl2832_sdr
blacklist rtl2832
blacklist r820t
EOF

echo "Attempting to unload modules..."
# Try removing the top-level drivers; modprobe will handle dependencies.
# If this fails, a reboot is usually required.
sudo modprobe -r rtl2832_sdr dvb_usb_rtl28xxu 2>/dev/null || true
sudo modprobe -r dvb_usb_rtl28xxu rtl2832_sdr rtl2832 r820t dvb_usb_v2 dvb_core rc_core 2>/dev/null || true

echo
loaded_after="$(mods_loaded | tr '\n' ' ' | xargs || true)"
if [[ -z "$loaded_after" ]]; then
  echo "OK: modules are unloaded."
else
  echo "Modules still loaded: $loaded_after"
  echo "You likely need to unplug/replug the RTL-SDR dongle or reboot."
fi

echo
echo "Next steps:"
echo "  - Unplug/replug the RTL-SDR dongle, OR reboot the machine"
echo "  - Verify: LD_LIBRARY_PATH=$ROOT_DIR/.local-rtl/lib $ROOT_DIR/.local-rtl/bin/rtl_test -t"
echo "  - Then start Spectrum (and/or Capture) from Admin → Radio"
