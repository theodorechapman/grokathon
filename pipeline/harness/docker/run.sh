#!/usr/bin/env bash
# Run one agent RE run in the container. Usage:
#   run.sh <rom-path> [out-dir]
# Env passthrough: MODEL, EFFORT, TIER, ENGINE, LABEL, MAX_PASSES, DRY_RUN.
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
engine="${ENGINE:-codex}"
grok_state=""

cleanup_grok_state() {
    if [[ -n "$grok_state" && -d "$grok_state" ]]; then
        # Preserve a rotated/refreshed local credential without exposing any
        # other host Grok state or mounting a macOS binary into Linux.
        if [[ -s "$grok_state/auth.json" ]]; then
            refreshed_auth="$HOME/.grok/auth.json.container-refresh.$$"
            install -m 600 "$grok_state/auth.json" "$refreshed_auth"
            mv "$refreshed_auth" "$HOME/.grok/auth.json"
        fi
        rm -rf "$grok_state"
    fi
}
trap cleanup_grok_state EXIT

# Give Grok a writable, ephemeral copy of only the local credential state. The
# Linux CLI is installed in /usr/local/bin inside the image.
if [[ "$engine" == "grok" ]]; then
    if [[ ! -s "$HOME/.grok/auth.json" ]]; then
        echo "agent: local Grok auth missing; run 'grok login --oauth' first." >&2
        exit 1
    fi
    grok_state="$(mktemp -d "${TMPDIR:-/tmp}/grokathon-grok-auth.XXXXXX")"
    chmod 700 "$grok_state"
    install -m 600 "$HOME/.grok/auth.json" "$grok_state/auth.json"
    [[ ! -f "$HOME/.grok/agent_id" ]] || install -m 600 "$HOME/.grok/agent_id" "$grok_state/agent_id"
    auth_args=(-v "$grok_state:/root/.grok")
    default_model="grok-4.5"
    default_effort="high"
    default_tier=""
else
    # API-key runs must not inherit the host's ChatGPT/Codex login. When no key
    # is supplied, retain the convenient local-login mount.
    if [[ -n "${OPENAI_API_KEY:-}" ]]; then
        auth_args=(-e OPENAI_API_KEY)
    else
        auth_args=(-v "$HOME/.codex:/root/.codex")
    fi
    default_model="gpt-5.6-sol"
    default_effort="medium"
    default_tier="fast"
fi

docker run --rm \
    -v "$rom:/rom.gb:ro" \
    -v "$out:/out" \
    "${auth_args[@]}" \
    -e "MODEL=${MODEL:-$default_model}" \
    -e "EFFORT=${EFFORT:-$default_effort}" \
    -e "TIER=${TIER:-$default_tier}" \
    -e "ENGINE=$engine" \
    -e "LABEL=${LABEL:-containerized}" \
    -e "MAX_PASSES=${MAX_PASSES:-8}" \
    -e "DRY_RUN=${DRY_RUN:-0}" \
    staticre-agent:local
