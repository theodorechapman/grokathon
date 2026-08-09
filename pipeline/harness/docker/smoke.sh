#!/usr/bin/env bash
# In-container smoke test of the grokboy emulator bridge: boots Breakout,
# exercises breakpoints, watchpoints, memory, save states, screenshots, and
# the SameBoy debugger. Usage: smoke.sh [image]
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
rom="$(cd "$here/../../raw_rom" && pwd)/breakout.gb"
postie="$(cd "$here/../../raw_rom" && pwd)/postie.gbc"
# The ROM is bind-mounted, never baked into the image: a recognizably named
# ROM inside the image would unblind agent runs.
image="${1:-staticre-agent:local}"
docker run --rm -v "$rom:/opt/pipeline/raw_rom/breakout.gb:ro" \
    --entrypoint python3 "$image" \
    /opt/pipeline/agent/breakout_smoke.py
docker run --rm -v "$postie:/opt/pipeline/raw_rom/postie.gbc:ro" \
    --entrypoint python3 "$image" \
    /opt/pipeline/agent/postie_smoke.py
docker run --rm -v "$postie:/opt/pipeline/raw_rom/postie.gbc:ro" \
    --entrypoint python3 "$image" \
    /opt/pipeline/agent/compareboy_smoke.py
