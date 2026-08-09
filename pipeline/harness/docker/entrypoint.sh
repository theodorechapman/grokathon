#!/usr/bin/env bash
# Run one self-contained agent RE run inside the container. The staticre MCP is
# a subprocess (--mcp local). Inputs: a ROM bind-mounted at $STATICRE_ROM
# (default /rom.gb) and engine auth at /root/.codex or /root/.grok.
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
elif [[ "${ENGINE}" == "grok" ]]; then
    if [[ ! -x /usr/local/bin/grok ]]; then
        echo "agent: Grok Build CLI is not installed in the image." >&2
        exit 1
    fi
    if [[ ! -f /root/.grok/auth.json ]]; then
        echo "agent: no Grok auth found. Launch through docker/run.sh with a local ~/.grok login." >&2
        exit 1
    fi
    if ! grok_models="$(grok models 2>&1)"; then
        echo "agent: Grok credential validation failed." >&2
        exit 1
    fi
    if grep -qi "not authenticated" <<<"${grok_models}"; then
        echo "agent: the mounted Grok credential is expired or invalid; run 'grok login --oauth' on the host." >&2
        exit 1
    fi
    if ! grep -q "grok-4.5" <<<"${grok_models}"; then
        echo "agent: Grok 4.5 is not available to the mounted local credential." >&2
        exit 1
    fi
else
    echo "agent: unsupported engine '${ENGINE}'" >&2
    exit 1
fi

args=(--rom "${STATICRE_ROM}" --mcp local --engine "${ENGINE}"
      --workspaces-dir /out --label "${LABEL:-containerized}"
      --max-passes "${MAX_PASSES:-8}")
[[ -n "${MODEL:-}"  ]] && args+=(--model "${MODEL}")
[[ -n "${EFFORT:-}" ]] && args+=(--effort "${EFFORT}")
[[ -n "${TIER:-}"   ]] && args+=(--tier "${TIER}")
[[ "${DRY_RUN:-0}" == "1" ]] && args+=(--dry-run)

exec python3 /opt/pipeline/harness/run_agent.py "${args[@]}"
