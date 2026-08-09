#!/usr/bin/env bash
# Run one agent RE run in the container. Usage:
#   run.sh <rom-path> [out-dir]
# Env passthrough: MODEL, EFFORT, TIER, ENGINE, LABEL, MAX_PASSES.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/../../.." && pwd)"
if [[ -f "$repo/.env" ]]; then
    set -a
    source "$repo/.env"
    set +a
fi

rom="${1:?usage: run.sh <rom-path> [out-dir]}"
out="${2:-$(pwd)/out}"
rom="$(cd "$(dirname "$rom")" && pwd)/$(basename "$rom")"
mkdir -p "$out"

# API-key runs must not inherit the host's ChatGPT/Codex login. When no key is
# supplied, retain the convenient local-login mount used by interactive runs.
if [[ -n "${OPENAI_API_KEY:-}" ]]; then
    auth_args=(-e OPENAI_API_KEY)
else
    auth_args=(-v "$HOME/.codex:/root/.codex")
fi

exec docker run --rm \
    -v "$rom:/rom.gb:ro" \
    -v "$out:/out" \
    "${auth_args[@]}" \
    -e "MODEL=${MODEL:-gpt-5.6-sol}" \
    -e "EFFORT=${EFFORT:-medium}" \
    -e "TIER=${TIER:-fast}" \
    -e "ENGINE=${ENGINE:-codex}" \
    -e "LABEL=${LABEL:-containerized}" \
    -e "MAX_PASSES=${MAX_PASSES:-8}" \
    staticre-agent:local
