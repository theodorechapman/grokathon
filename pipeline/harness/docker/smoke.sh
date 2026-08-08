#!/usr/bin/env bash
# In-container smoke test of the grokboy emulator bridge: boots Breakout,
# exercises breakpoints, watchpoints, memory, save states, screenshots, and
# the SameBoy debugger. Usage: smoke.sh [image]
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
rom="$(cd "$here/../../raw_rom" && pwd)/breakout.gb"
# The ROM is bind-mounted, never baked into the image: a recognizably named
# ROM inside the image would unblind agent runs.
exec docker run --rm -v "$rom:/opt/pipeline/raw_rom/breakout.gb:ro" \
    --entrypoint python3 "${1:-staticre-agent:local}" \
    /opt/pipeline/agent/breakout_smoke.py
