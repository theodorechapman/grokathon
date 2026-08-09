#!/usr/bin/env bash
set -euo pipefail

readonly LAB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly MAME_DIR="${MAME_DIR:-/tmp/mame-sab80c535-src}"
readonly MAME_BIN="$MAME_DIR/motronic175"
readonly ROM_FILE="$LAB_DIR/../analysis/TotalCombinedROM.bin"
readonly RUN_DIR="${RUN_DIR:-/tmp/mame-sab80c535-run}"
readonly ROM_DIR="$RUN_DIR/roms/motronic175"

if [[ ! -x "$MAME_BIN" ]]; then
	echo "MAME target is absent; run build-mame.sh first" >&2
	exit 1
fi
if [[ ! -f "$ROM_FILE" ]]; then
	echo "canonical ROM is absent: $ROM_FILE" >&2
	exit 1
fi

mkdir -p "$ROM_DIR" "$RUN_DIR/cfg"
ln -sfn "$ROM_FILE" "$ROM_DIR/totalcombinedrom.bin"
rm -f "$LAB_DIR/runtime-trace.log" "$LAB_DIR/runtime-console.log"

cd "$LAB_DIR"
"$MAME_BIN" motronic175 \
	-rompath "$RUN_DIR/roms" \
	-cfg_directory "$RUN_DIR/cfg" \
	-debug \
	-debugger osx \
	-debugscript "$LAB_DIR/trace-reset.cmd" \
	-sound none \
	-nothrottle \
	-nosleep \
	-nowriteconfig \
	-skip_gameinfo \
	-oslog \
	2>&1 | tee "$LAB_DIR/runtime-console.log"

python3 "$LAB_DIR/test-smoke.py" --rom "$ROM_FILE"
