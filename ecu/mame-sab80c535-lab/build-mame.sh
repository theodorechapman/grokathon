#!/usr/bin/env bash
set -euo pipefail

readonly MAME_URL="https://github.com/mamedev/mame.git"
readonly MAME_COMMIT="a5cc550d0a2cf7218cbd94c1a0780f7a713f8d8e"
readonly LAB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly MAME_DIR="${MAME_DIR:-/tmp/mame-sab80c535-src}"
readonly JOBS="${JOBS:-4}"
readonly PATCH_FILE="$LAB_DIR/motronic175.patch"

for tool in git make python3 sdl2-config; do
	if ! command -v "$tool" >/dev/null 2>&1; then
		echo "required build tool is missing: $tool" >&2
		exit 1
	fi
done

if [[ ! -e "$MAME_DIR" ]]; then
	git clone --depth 1 --filter=blob:none --no-tags "$MAME_URL" "$MAME_DIR"
fi

if [[ ! -d "$MAME_DIR/.git" ]]; then
	echo "MAME_DIR is not a Git checkout: $MAME_DIR" >&2
	exit 1
fi

if ! git -C "$MAME_DIR" cat-file -e "${MAME_COMMIT}^{commit}" 2>/dev/null; then
	git -C "$MAME_DIR" fetch --depth 1 origin "$MAME_COMMIT"
fi

if [[ "$(git -C "$MAME_DIR" rev-parse HEAD)" != "$MAME_COMMIT" ]]; then
	if [[ -n "$(git -C "$MAME_DIR" status --porcelain)" ]]; then
		echo "refusing to switch a modified MAME checkout: $MAME_DIR" >&2
		exit 1
	fi
	git -C "$MAME_DIR" checkout --detach "$MAME_COMMIT"
fi

if git -C "$MAME_DIR" apply --reverse --check "$PATCH_FILE" 2>/dev/null; then
	echo "MAME lab patch is already applied"
else
	if [[ -n "$(git -C "$MAME_DIR" status --porcelain)" ]]; then
		echo "refusing to patch a modified MAME checkout: $MAME_DIR" >&2
		exit 1
	fi
	git -C "$MAME_DIR" apply --check "$PATCH_FILE"
	git -C "$MAME_DIR" apply "$PATCH_FILE"
fi

make -C "$MAME_DIR" \
	SUBTARGET=motronic175 \
	SOURCES=src/mame/skeleton/motronic175.cpp \
	REGENIE=1 \
	SYMBOLS=0 \
	IGNORE_GIT=1 \
	OSD=sdl \
	USE_LIBSDL=1 \
	OVERRIDE_CC=/usr/bin/clang \
	OVERRIDE_CXX=/usr/bin/clang++ \
	"-j$JOBS"

if [[ ! -x "$MAME_DIR/motronic175" ]]; then
	echo "build completed without the expected executable" >&2
	exit 1
fi

echo "built $MAME_DIR/motronic175 at MAME commit $MAME_COMMIT"
