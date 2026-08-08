#!/usr/bin/env bash
# Dispatch the staticre backend inside the container. The ROM is a runtime
# input: bind-mount it to $STATICRE_ROM (default /rom.gb). Modes:
#   mcp     stdio MCP server (default) — the agent spawns this via `docker run -i`
#   serve   JSON-lines request/response backend
#   smoke   exercise every op against the ROM and print results
set -euo pipefail

if [[ ! -f "${STATICRE_ROM}" ]]; then
    echo "staticre: ROM not found at STATICRE_ROM=${STATICRE_ROM}." >&2
    echo "Bind-mount a ROM, e.g. -v /path/to/rom.gb:/rom.gb:ro" >&2
    exit 1
fi
mkdir -p "${STATICRE_WORKDIR}"

mode="${1:-mcp}"
case "$mode" in
    mcp)
        exec uv run --frozen staticre-mcp
        ;;
    serve|smoke)
        exec uv run --frozen staticre "$mode" "${STATICRE_ROM}" --workdir "${STATICRE_WORKDIR}"
        ;;
    *)
        echo "staticre: unknown mode '$mode' (expected mcp|serve|smoke)" >&2
        exit 2
        ;;
esac
