#!/usr/bin/env bash
set -euo pipefail

# Hard-reset the RTL-SDR dongle and clear any stuck rtl_* tasks.
# Usage:
#   sudo bash scripts/rtl-sdr-reset.sh
#   sudo bash scripts/rtl-sdr-reset.sh --stop-only
#   sudo bash scripts/rtl-sdr-reset.sh --restart-capture
#   sudo bash scripts/rtl-sdr-reset.sh --restart-spectrum
#
# Notes:
# - With ONE dongle, you cannot run Capture (rtl_sdr/rtl_fm) and Spectrum (rtl_power) at the same time.
# - This script helps when the dongle is "busy" or a process is stuck holding it.

STOP_ONLY=0
RESTART_CAPTURE=0
RESTART_SPECTRUM=0

for arg in "$@"; do
  case "$arg" in
    --stop-only) STOP_ONLY=1 ;;
    --restart-capture) RESTART_CAPTURE=1 ;;
    --restart-spectrum) RESTART_SPECTRUM=1 ;;
    -h|--help)
      sed -n '1,60p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown arg: $arg" >&2
      exit 2
      ;;
  esac
done

# Find RTL-SDR device node via lsusb (common Realtek 0bda:2838).
lsusb_line="$(lsusb | awk 'tolower($0) ~ /0bda:2838/ {print; exit}')" || true
if [[ -z "${lsusb_line:-}" ]]; then
  echo "RTL-SDR not found via lsusb (expected 0bda:2838)." >&2
  echo "lsusb output excerpt:" >&2
  lsusb | head -n 50 >&2 || true
  exit 1
fi

bus_num="$(echo "$lsusb_line" | awk '{print $2}')"
dev_num="$(echo "$lsusb_line" | awk '{print $4}' | sed 's/://')"
if [[ -z "${bus_num:-}" || -z "${dev_num:-}" ]]; then
  echo "Failed to parse bus/device from: $lsusb_line" >&2
  exit 1
fi

dev_node="/dev/bus/usb/$(printf '%03d' "$bus_num")/$(printf '%03d' "$dev_num")"

if [[ ! -e "$dev_node" ]]; then
  echo "USB device node does not exist: $dev_node" >&2
  exit 1
fi

echo "RTL-SDR device: $lsusb_line"
echo "Device node: $dev_node"

if command -v pm2 >/dev/null 2>&1; then
  echo "Stopping PM2 processes that may hold the dongle (radio, radio-spectrum)..."
  pm2 stop radio radio-spectrum >/dev/null 2>&1 || true
fi

echo "Killing any running rtl_* processes..."
# Broad kill pattern (matches rtl_fm/rtl_sdr/rtl_tcp/rtl_power/etc)
pkill -f '/rtl_(fm|sdr|tcp|adsb|power|eeprom|biast)(\s|$)' 2>/dev/null || true
sleep 0.3

# Kill any process still holding the USB device node.
if command -v lsof >/dev/null 2>&1; then
  holders="$(lsof "$dev_node" 2>/dev/null || true)"
  if [[ -n "$holders" ]]; then
    echo "Processes still holding $dev_node:";
    echo "$holders" | sed 's/^/  /'
  fi
fi

if command -v fuser >/dev/null 2>&1; then
  echo "Forcing release of $dev_node (fuser -k)..."
  fuser -k "$dev_node" >/dev/null 2>&1 || true
fi

# Best-effort: unload DVB kernel drivers (non-persistent) so they don't reclaim the dongle.
# (If this fails, the dongle may need unplug/replug or a reboot.)
echo "Attempting to unload conflicting DVB/RTL kernel modules (non-persistent)..."
modprobe -r rtl2832_sdr dvb_usb_rtl28xxu 2>/dev/null || true
modprobe -r dvb_usb_rtl28xxu rtl2832_sdr rtl2832 r820t dvb_usb_v2 dvb_core rc_core 2>/dev/null || true

if [[ "$STOP_ONLY" -eq 1 ]]; then
  echo "Stop-only requested; skipping USB reset.";
  exit 0
fi

# USB reset via USBDEVFS_RESET ioctl.
# Requires root to open the usbfs device node.
echo "Resetting USB device (USBDEVFS_RESET)..."
python3 - <<PY
import fcntl
import os
import sys

dev = os.environ.get('DEV_NODE')
if not dev:
    dev = '$dev_node'
USBDEVFS_RESET = 0x5514
try:
    fd = os.open(dev, os.O_WRONLY)
except PermissionError:
    print(f"Permission denied opening {dev}. Run with sudo.", file=sys.stderr)
    raise
try:
    fcntl.ioctl(fd, USBDEVFS_RESET, 0)
    print("USB reset OK")
finally:
    os.close(fd)
PY

echo "Reloading udev rules + triggering..."
udevadm control --reload-rules >/dev/null 2>&1 || true
udevadm trigger >/dev/null 2>&1 || true
sleep 0.5

if command -v pm2 >/dev/null 2>&1; then
  if [[ "$RESTART_CAPTURE" -eq 1 ]]; then
    echo "Restarting PM2 capture (radio)..."
    pm2 start radio >/dev/null 2>&1 || pm2 restart radio >/dev/null 2>&1 || true
  fi
  if [[ "$RESTART_SPECTRUM" -eq 1 ]]; then
    echo "Restarting PM2 spectrum (radio-spectrum)..."
    pm2 start radio-spectrum >/dev/null 2>&1 || pm2 restart radio-spectrum >/dev/null 2>&1 || true
  fi
fi

echo "Done."
