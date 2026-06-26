#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENDOR="$ROOT/native/brainbit-ios-relay/Vendor"
TMP="$(mktemp -d)"
REPO="https://github.com/BrainbitLLC/apple_neurosdk2.git"

cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

echo "[setup-neurosdk2-vendor] Cloning apple_neurosdk2..."
git clone --depth 1 "$REPO" "$TMP/apple_neurosdk2"

mkdir -p "$VENDOR"
rm -rf "$VENDOR/neurosdk2.xcframework" "$VENDOR/macos"

cp -R "$TMP/apple_neurosdk2/ios/neurosdk2.xcframework" "$VENDOR/"
cp -R "$TMP/apple_neurosdk2/macos" "$VENDOR/"

echo "[setup-neurosdk2-vendor] Installed:"
echo "  $VENDOR/neurosdk2.xcframework"
echo "  $VENDOR/macos/libneurosdk2.dylib"
