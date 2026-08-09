#!/usr/bin/env bash
set -euo pipefail

readonly ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PYTHONDONTWRITEBYTECODE=1

python3 -B "$ROOT/tools/generate-fixtures.py"
for test_file in "$ROOT"/tests/test-*.py; do
	python3 -B "$test_file" -v
done
