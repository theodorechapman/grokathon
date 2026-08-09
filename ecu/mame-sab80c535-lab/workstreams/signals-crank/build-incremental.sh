#!/usr/bin/env bash
set -euo pipefail

readonly ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly COMMIT="a5cc550d0a2cf7218cbd94c1a0780f7a713f8d8e"
readonly JOBS="${JOBS:-4}"

if [[ -z "${MAME_DIR:-}" ]]; then
	echo "MAME_DIR must name an existing prepared accuracy-xdata tree" >&2
	exit 1
fi
if [[ ! -d "$MAME_DIR/.git" ]]; then
	echo "MAME_DIR must be a Git MAME checkout" >&2
	exit 1
fi
if [[ "$(git -C "$MAME_DIR" rev-parse HEAD)" != "$COMMIT" ]]; then
	echo "MAME_DIR is not at pinned commit $COMMIT" >&2
	exit 1
fi
if [[ ! -f "$MAME_DIR/src/mame/skeleton/motronic175-xdata.h" ]]; then
	echo "run the accuracy-xdata installation before this incremental layer" >&2
	exit 1
fi

apply_once() {
	local patch_path="$1"
	if git -C "$MAME_DIR" apply --reverse --check "$patch_path" 2>/dev/null; then
		return
	fi
	git -C "$MAME_DIR" apply --check "$patch_path"
	git -C "$MAME_DIR" apply "$patch_path"
}

apply_once "$ROOT/patches/sab80c515-cc0-capture.patch"
apply_once "$ROOT/patches/motronic175-crank-driver.patch"
apply_once "$ROOT/patches/sab80c515-capture-test-driver.patch"

make -C "$MAME_DIR" \
	SUBTARGET=motronic175 \
	SOURCES=src/mame/skeleton/motronic175.cpp,src/mame/skeleton/motronic175-xdata.cpp,src/mame/skeleton/motronic175-xdata-config.cpp,src/mame/skeleton/sab80c515test.cpp,src/mame/skeleton/sab80c515-capture-test.cpp \
	REGENIE=1 SYMBOLS=0 IGNORE_GIT=1 OSD=sdl USE_LIBSDL=1 \
	OVERRIDE_CC=/usr/bin/clang OVERRIDE_CXX=/usr/bin/clang++ "-j$JOBS"

test -x "$MAME_DIR/motronic175"
echo "incremental crank/capture target: $MAME_DIR/motronic175"
