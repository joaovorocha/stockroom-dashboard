#!/usr/bin/env bash
set -euo pipefail

echo "Killing any running rtl_* processes (rtl_fm/rtl_sdr/rtl_tcp/rtl_adsb/rtl_power/rtl_eeprom/rtl_biast)..."
pkill -f '/rtl_(fm|sdr|tcp|adsb|power|eeprom|biast)(\\s|$)' 2>/dev/null || true
sleep 0.2
ps aux | rg -n 'rtl_(fm|sdr|tcp|adsb|power|eeprom|biast)' || echo "No rtl_* processes found."

