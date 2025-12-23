#!/usr/bin/env bash
set -euo pipefail

# Builds a local rtl-sdr toolchain under .local-rtl/ without requiring apt install.
# This is useful on locked-down servers where you can't install system packages.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT_DIR/.local-rtl"
EXTRACT_DIR="$OUT_DIR/extract"
BIN_DIR="$OUT_DIR/bin"
LIB_DIR="$OUT_DIR/lib"

mkdir -p "$OUT_DIR" "$EXTRACT_DIR" "$BIN_DIR" "$LIB_DIR"

cd "$OUT_DIR"
echo "Downloading rtl-sdr .deb packages (no root required)..."
apt-get download librtlsdr0 rtl-sdr

echo "Extracting..."
dpkg-deb -x librtlsdr0_*.deb "$EXTRACT_DIR"
dpkg-deb -x rtl-sdr_*.deb "$EXTRACT_DIR"

echo "Installing binaries..."
cp -f "$EXTRACT_DIR/usr/bin/rtl_"* "$BIN_DIR/"

echo "Installing librtlsdr..."
cp -f "$EXTRACT_DIR/usr/lib/"*/librtlsdr.so.0.6.0 "$LIB_DIR/"
ln -sf librtlsdr.so.0.6.0 "$LIB_DIR/librtlsdr.so.0"
ln -sf librtlsdr.so.0 "$LIB_DIR/librtlsdr.so"

echo
echo "Done."
echo "Test:"
echo "  LD_LIBRARY_PATH=$ROOT_DIR/.local-rtl/lib $ROOT_DIR/.local-rtl/bin/rtl_test -t"

