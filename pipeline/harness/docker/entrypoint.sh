#!/usr/bin/env bash
# Run one self-contained agent RE run inside the container. The staticre MCP is
# a subprocess (--mcp local). Inputs: a ROM bind-mounted at $STATICRE_ROM
# (default /rom.gb) and either OPENAI_API_KEY or Codex auth at /root/.codex.
# Output: the run workspace under the mounted /out.
set -euo pipefail

: "${STATICRE_ROM:=/rom.gb}"
: "${ENGINE:=codex}"

if [[ ! -f "${STATICRE_ROM}" ]]; then
    echo "agent: ROM not found at ${STATICRE_ROM} — bind-mount one, e.g. -v rom.gb:/rom.gb:ro" >&2
    exit 1
fi
if [[ "${ENGINE}" == "codex" ]]; then
    if [[ -n "${OPENAI_API_KEY:-}" ]]; then
        # Persist only inside this disposable container. Neither stdin nor the
        # command's output reveals the key.
        printenv OPENAI_API_KEY | codex login --with-api-key >/dev/null
    elif [[ ! -f /root/.codex/auth.json ]]; then
        echo "agent: no Codex auth found. Set OPENAI_API_KEY or mount \$HOME/.codex." >&2
        exit 1
    fi
fi

args=(--rom "${STATICRE_ROM}" --mcp local --engine "${ENGINE}"
      --workspaces-dir /out --label "${LABEL:-containerized}")
[[ -n "${MODEL:-}"  ]] && args+=(--model "${MODEL}")
[[ -n "${EFFORT:-}" ]] && args+=(--effort "${EFFORT}")
[[ -n "${TIER:-}"   ]] && args+=(--tier "${TIER}")

exec python3 /opt/pipeline/harness/run_agent.py "${args[@]}"
