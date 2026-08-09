#!/usr/bin/env bash
set -euo pipefail

readonly ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly TEST_BINARY="$ROOT/tests/.signal-provider-test"
trap 'rm -f "$TEST_BINARY"' EXIT

for tool in c++ python3; do
	if ! command -v "$tool" >/dev/null 2>&1; then
		echo "missing required tool: $tool" >&2
		exit 1
	fi
done

python3 "$ROOT/tests/test-evidence.py"
python3 "$ROOT/tests/test-integrated.py"
c++ -std=c++17 -Wall -Wextra -Werror -pedantic \
	"$ROOT/src/motronic175-signal-provider.cpp" \
	"$ROOT/tests/test-signal-provider.cpp" \
	-o "$TEST_BINARY"
"$TEST_BINARY"
echo "PASS: board signal provider is composed in accuracy-xdata"
