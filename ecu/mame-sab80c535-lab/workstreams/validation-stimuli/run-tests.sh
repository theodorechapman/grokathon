#!/usr/bin/env bash
set -euo pipefail

readonly HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly RESULT="$HERE/logs/test-results.txt"
readonly REPLAY_DIR="$(mktemp -d)"
trap 'rm -rf "$REPLAY_DIR"' EXIT

export PYTHONDONTWRITEBYTECODE=1
{
	echo '$ python3 tests/test-negative-gates.py -v'
	python3 "$HERE/tests/test-negative-gates.py" -v
	echo '$ python3 tools/run-mame.py --profile all'
	python3 "$HERE/tools/run-mame.py" --profile all
	cp "$HERE/logs/reset-events.ndjson" "$REPLAY_DIR/reset.ndjson"
	cp "$HERE/logs/stimulus-events.ndjson" "$REPLAY_DIR/stimulus.ndjson"
	echo '$ python3 tools/run-mame.py --profile all # deterministic replay'
	python3 "$HERE/tools/run-mame.py" --profile all
	cmp "$REPLAY_DIR/reset.ndjson" "$HERE/logs/reset-events.ndjson"
	cmp "$REPLAY_DIR/stimulus.ndjson" "$HERE/logs/stimulus-events.ndjson"
	echo 'PASS: normalized reset and stimulus replays are byte-identical'
} 2>&1 | tee "$RESULT"
