#!/bin/bash

# Reset RTL-SDR device and clean up stuck processes

echo "🔧 Cleaning up stuck processes..."
pkill -9 -f 'radio_service|rtl_sdr|transcribe_worker'
sleep 2

echo "🔌 Finding RTL-SDR device..."
RTL_DEVICE=$(lsusb | grep -i 'RTL2838\|DVB-T' | sed 's/.*Bus \([0-9]\+\) Device \([0-9]\+\).*/\/dev\/bus\/usb\/\1\/\2/')

if [ -z "$RTL_DEVICE" ]; then
    echo "❌ RTL-SDR device not found!"
    exit 1
fi

echo "📍 Found device at: $RTL_DEVICE"

# Try to unbind and rebind the USB device
echo "🔄 Resetting USB device..."
BUS=$(echo $RTL_DEVICE | cut -d/ -f5)
DEV=$(echo $RTL_DEVICE | cut -d/ -f6)

# Find the USB device path
USB_PATH=$(find /sys/bus/usb/devices/ -name "${BUS}-*" 2>/dev/null | head -1)

if [ -n "$USB_PATH" ]; then
    echo "Unbinding device..."
    echo "$USB_PATH" | sudo tee /sys/bus/usb/drivers/usb/unbind >/dev/null 2>&1 || true
    sleep 1
    echo "Rebinding device..."
    echo "$USB_PATH" | sudo tee /sys/bus/usb/drivers/usb/bind >/dev/null 2>&1 || true
    sleep 1
fi

echo "✅ Device reset complete"
echo "🚀 Starting radio services..."
./radio-watchdog.sh restart
