#!/usr/bin/env bash
set -euo pipefail

readonly MAME_URL="https://github.com/mamedev/mame.git"
readonly MAME_COMMIT="a5cc550d0a2cf7218cbd94c1a0780f7a713f8d8e"
readonly WORK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly WORKSTREAMS="$(cd "$WORK_DIR/.." && pwd)"
readonly MAME_DIR="${MAME_DIR:-/tmp/mame-motronic-mcu-core}"
readonly JOBS="${JOBS:-4}"

for tool in git make python3 sdl2-config; do
	if ! command -v "$tool" >/dev/null 2>&1; then
		echo "required build tool is missing: $tool" >&2
		exit 1
	fi
done

if [[ ! -e "$MAME_DIR" ]]; then
	git clone --filter=blob:none --no-checkout "$MAME_URL" "$MAME_DIR"
	git -C "$MAME_DIR" fetch --depth 1 origin "$MAME_COMMIT"
	git -C "$MAME_DIR" checkout --detach "$MAME_COMMIT"
fi
if [[ ! -d "$MAME_DIR/.git" ]]; then
	echo "MAME_DIR is not a Git checkout: $MAME_DIR" >&2
	exit 1
fi
if [[ "$(git -C "$MAME_DIR" rev-parse HEAD)" != "$MAME_COMMIT" ]]; then
	echo "MAME checkout is not at pinned commit $MAME_COMMIT" >&2
	exit 1
fi

apply_once()
{
	local patch="$1"
	if git -C "$MAME_DIR" apply --reverse --check "$patch" 2>/dev/null; then
		return
	fi
	git -C "$MAME_DIR" apply --check "$patch"
	git -C "$MAME_DIR" apply "$patch"
}

if [[ ! -e "$MAME_DIR/src/devices/cpu/mcs51/sab80c535_irq.cpp" ]]; then
	apply_once "$WORKSTREAMS/mcu-core/mame-sab80c515.patch"
	apply_once "$WORK_DIR/patches/mcs51-instruction-callback.patch"
	apply_once "$WORKSTREAMS/signals-crank/patches/sab80c515-cc0-capture.patch"
	apply_once "$WORK_DIR/patches/sab80c515-ccu-write-callback.patch"
	apply_once "$WORKSTREAMS/signals-crank/patches/sab80c515-capture-test-driver.patch"
fi

install -m 0644 "$WORK_DIR"/src/*.{cpp,h} "$MAME_DIR/src/mame/skeleton/"
install -m 0644 \
	"$WORKSTREAMS/signals-board-io/src/motronic175-signal-provider.cpp" \
	"$WORKSTREAMS/signals-board-io/src/motronic175-signal-provider.h" \
	"$WORKSTREAMS/signals-adc/src/motronic175-adc.cpp" \
	"$WORKSTREAMS/signals-adc/src/motronic175-adc.h" \
	"$WORKSTREAMS/signals-kw71/mame/motronic175-kw71.cpp" \
	"$WORKSTREAMS/signals-kw71/mame/motronic175-kw71.h" \
	"$MAME_DIR/src/mame/skeleton/"

readonly SOURCES="$(
	python3 - <<'PY'
sources = [
    "motronic175.cpp",
    "motronic175-runtime.cpp",
    "motronic175-adc-bindings.cpp",
    "motronic175-xdata.cpp",
    "motronic175-xdata-config.cpp",
    "motronic175-bridge-runtime.cpp",
    "motronic175-bridge-protocol.cpp",
    "motronic175-bridge-frame.cpp",
    "motronic175-bridge-socket.cpp",
    "motronic175-bridge-telemetry.cpp",
    "motronic175-signal-provider.cpp",
    "motronic175-adc.cpp",
    "motronic175-kw71.cpp",
    "sab80c515test.cpp",
    "sab80c515-capture-test.cpp",
]
print(",".join(f"src/mame/skeleton/{name}" for name in sources))
PY
)"

make -C "$MAME_DIR" \
	SUBTARGET=motronic175 \
	SOURCES="$SOURCES" \
	REGENIE=1 \
	SYMBOLS=0 \
	IGNORE_GIT=1 \
	OSD=sdl \
	USE_LIBSDL=1 \
	OVERRIDE_CC=/usr/bin/clang \
	OVERRIDE_CXX=/usr/bin/clang++ \
	"-j$JOBS"

test -x "$MAME_DIR/motronic175"
echo "built $MAME_DIR/motronic175 at $MAME_COMMIT"
