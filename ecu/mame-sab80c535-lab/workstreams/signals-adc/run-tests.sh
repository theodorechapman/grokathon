#!/usr/bin/env bash
set -euo pipefail

readonly ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PYTHONPATH="$ROOT/python${PYTHONPATH:+:$PYTHONPATH}"

for test_file in "$ROOT"/tests/test-*.py; do
	python3 "$test_file" -v
done
