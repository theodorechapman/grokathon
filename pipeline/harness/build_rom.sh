#!/usr/bin/env bash
# Stable build entry point supplied to every reconstruction workspace.
set -euo pipefail

workspace="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -x /opt/gbdk/bin/lcc ]]; then
    exec make -C "$workspace/src" "$@"
fi

image="${GBDK_IMAGE:-staticre-agent:local}"
if command -v docker >/dev/null 2>&1 && docker image inspect "$image" >/dev/null 2>&1; then
    exec docker run --rm \
        --entrypoint make \
        -v "$workspace:/workspace" \
        -w /workspace/src \
        "$image" "$@"
fi

echo "No GBDK toolchain found." >&2
echo "Install GBDK at /opt/gbdk or build the $image container image." >&2
exit 127
