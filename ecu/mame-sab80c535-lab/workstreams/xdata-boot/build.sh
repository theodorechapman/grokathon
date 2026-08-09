#!/usr/bin/env bash
set -euo pipefail

readonly MAME_URL="https://github.com/mamedev/mame.git"
readonly MAME_COMMIT="a5cc550d0a2cf7218cbd94c1a0780f7a713f8d8e"
readonly WORK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly MAME_DIR="${MAME_DIR:-/tmp/mame-motronic-xdata}"
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

for patch in \
	"$WORK_DIR/patches/mcs51-instruction-callback.patch" \
	"$WORK_DIR/patches/mame-registration.patch"; do
	if git -C "$MAME_DIR" apply --reverse --check "$patch" 2>/dev/null; then
		continue
	fi
	git -C "$MAME_DIR" apply --check "$patch"
	git -C "$MAME_DIR" apply "$patch"
done

install -m 0644 \
	"$WORK_DIR/src/motronic175.cpp" \
	"$WORK_DIR/src/motronic175-xdata.cpp" \
	"$WORK_DIR/src/motronic175-xdata.h" \
	"$MAME_DIR/src/mame/skeleton/"

make -C "$MAME_DIR" \
	SUBTARGET=motronic175 \
	SOURCES=src/mame/skeleton/motronic175.cpp,src/mame/skeleton/motronic175-xdata.cpp \
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
