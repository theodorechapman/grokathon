#!/usr/bin/env bash
# Run one agent RE run in the container. Usage:
#   run.sh <rom-path> [out-dir]
# Env passthrough: MODEL, EFFORT, TIER, ENGINE, LABEL.
set -euo pipefail

rom="${1:?usage: run.sh <rom-path> [out-dir]}"
out="${2:-$(pwd)/out}"
rom="$(cd "$(dirname "$rom")" && pwd)/$(basename "$rom")"
mkdir -p "$out"

exec docker run --rm \
    -v "$rom:/rom.gb:ro" \
    -v "$out:/out" \
    -v "$HOME/.codex:/root/.codex" \
    -e "MODEL=${MODEL:-gpt-5.6-sol}" \
    -e "EFFORT=${EFFORT:-medium}" \
    -e "TIER=${TIER:-fast}" \
    -e "ENGINE=${ENGINE:-codex}" \
    -e "LABEL=${LABEL:-containerized}" \
    staticre-agent:local
