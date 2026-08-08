#!/usr/bin/env bash
set -euo pipefail

RECONSTRUCTION_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$RECONSTRUCTION_DIR/../../.." && pwd)"
ARCADE_BUNDLE="$REPO_ROOT/arcade/public/games/breakout"
ROM_NAME="breakout-reconstructed.gb"
PUBLISHED_ROM="$ARCADE_BUNDLE/$ROM_NAME"
TEMP_ROM="$PUBLISHED_ROM.tmp"

trap 'rm -f "$TEMP_ROM"' EXIT

make -B -C "$RECONSTRUCTION_DIR" "$ROM_NAME"
make -C "$RECONSTRUCTION_DIR" verify
mkdir -p "$ARCADE_BUNDLE"
cp "$RECONSTRUCTION_DIR/$ROM_NAME" "$TEMP_ROM"
mv "$TEMP_ROM" "$PUBLISHED_ROM"

trap - EXIT
printf 'Published verified ROM to %s\n' "$PUBLISHED_ROM"
