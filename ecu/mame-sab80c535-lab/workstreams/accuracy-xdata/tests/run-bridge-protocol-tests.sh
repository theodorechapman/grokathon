#!/usr/bin/env bash
set -euo pipefail

readonly ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly MAME_DIR="${MAME_DIR:-/tmp/mame-motronic-mcu-core}"
readonly BINARY="/tmp/motronic175-bridge-protocol-test"

/usr/bin/clang++ \
	-std=c++17 \
	-Wall -Wextra -Werror \
	-I"$ROOT/src" \
	-I"$MAME_DIR/3rdparty/rapidjson/include" \
	"$ROOT/src/motronic175-bridge-protocol.cpp" \
	"$ROOT/tests/test-bridge-protocol.cpp" \
	-o "$BINARY"
"$BINARY"
