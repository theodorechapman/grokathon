#!/usr/bin/env bash
set -euo pipefail

readonly HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly MAME_DIR="${MAME_DIR:-/tmp/mame-motronic-validation}"
readonly MAME_URL="https://github.com/mamedev/mame.git"
readonly COMMIT="a5cc550d0a2cf7218cbd94c1a0780f7a713f8d8e"
readonly PATCH="$HERE/mame/motronic-validation.patch"
readonly JOBS="${JOBS:-4}"

for tool in git make sdl2-config; do
	if ! command -v "$tool" >/dev/null 2>&1; then
		echo "required build tool is missing: $tool" >&2
		exit 1
	fi
done
if [[ ! -e "$MAME_DIR" ]]; then
	git clone --filter=blob:none --no-tags "$MAME_URL" "$MAME_DIR"
fi
if [[ ! -d "$MAME_DIR/.git" ]]; then
	echo "not a Git checkout: $MAME_DIR" >&2
	exit 1
fi
if ! git -C "$MAME_DIR" cat-file -e "$COMMIT^{commit}" 2>/dev/null; then
	git -C "$MAME_DIR" fetch --depth 1 origin "$COMMIT"
fi
if [[ "$(git -C "$MAME_DIR" rev-parse HEAD)" != "$COMMIT" ]]; then
	if [[ -n "$(git -C "$MAME_DIR" status --porcelain)" ]]; then
		echo "refusing to switch a modified checkout" >&2
		exit 1
	fi
	git -C "$MAME_DIR" checkout --detach "$COMMIT"
fi
if ! git -C "$MAME_DIR" apply --reverse --check "$PATCH" 2>/dev/null; then
	if [[ -n "$(git -C "$MAME_DIR" status --porcelain)" ]]; then
		echo "refusing to patch a modified checkout" >&2
		exit 1
	fi
	git -C "$MAME_DIR" apply --check "$PATCH"
	git -C "$MAME_DIR" apply "$PATCH"
fi

make -C "$MAME_DIR" \
	SUBTARGET=motronicvalid \
	SOURCES=src/mame/skeleton/motronic-validation.cpp \
	REGENIE=1 SYMBOLS=0 IGNORE_GIT=1 \
	OSD=sdl USE_LIBSDL=1 \
	OVERRIDE_CC=/usr/bin/clang OVERRIDE_CXX=/usr/bin/clang++ \
	"-j$JOBS"

test -x "$MAME_DIR/motronicvalid"
echo "built $MAME_DIR/motronicvalid at $COMMIT"
