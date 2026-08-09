#!/usr/bin/env bash
set -euo pipefail

readonly WORK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly MAME_DIR="${MAME_DIR:-/tmp/mame-motronic-xdata}"
readonly MAME_BIN="$MAME_DIR/motronic175"
readonly ROM_FILE="$WORK_DIR/../../../analysis/TotalCombinedROM.bin"
readonly RUN_DIR="${RUN_DIR:-/tmp/mame-motronic-xdata-run}"
readonly ROM_DIR="$RUN_DIR/roms/motronic175"
readonly COMMIT="a5cc550d0a2cf7218cbd94c1a0780f7a713f8d8e"

if [[ ! -x "$MAME_BIN" ]]; then
	echo "MAME target is absent; run build.sh first" >&2
	exit 1
fi
if [[ ! -f "$ROM_FILE" ]]; then
	echo "canonical ROM is absent: $ROM_FILE" >&2
	exit 1
fi

mkdir -p "$ROM_DIR" "$RUN_DIR/cfg"
ln -sfn "$ROM_FILE" "$ROM_DIR/totalcombinedrom.bin"
rm -f \
	"$WORK_DIR/runtime-trace.tmp" \
	"$WORK_DIR/runtime-model-trace.log" \
	"$WORK_DIR/runtime-model-console.log" \
	"$WORK_DIR/runtime-no-xram-trace.log" \
	"$WORK_DIR/runtime-no-xram-console.log" \
	"$WORK_DIR/runtime-summary.json"

run_case() {
	local name="$1"
	shift
	(
		cd "$WORK_DIR"
		echo "RUN case=$name mame_commit=$COMMIT"
		echo "RUN rom_sha256=$(shasum -a 256 "$ROM_FILE" | awk '{print $1}')"
		"$@" "$MAME_BIN" motronic175 \
			-rompath "$RUN_DIR/roms" \
			-cfg_directory "$RUN_DIR/cfg" \
			-debug \
			-debugger osx \
			-debugscript "$WORK_DIR/trace.cmd" \
			-sound none \
			-nothrottle \
			-nosleep \
			-nowriteconfig \
			-skip_gameinfo \
			-oslog
	) 2>&1 | tee "$WORK_DIR/runtime-$name-console.log"
	mv "$WORK_DIR/runtime-trace.tmp" "$WORK_DIR/runtime-$name-trace.log"
}

run_case model env -u MOTRONIC_XRAM_DISABLE
run_case no-xram env MOTRONIC_XRAM_DISABLE=1

python3 "$WORK_DIR/analyze-traces.py"
python3 "$WORK_DIR/test-evidence.py" --rom "$ROM_FILE"
