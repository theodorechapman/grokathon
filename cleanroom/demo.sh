#!/usr/bin/env bash
# Launch the whole demo stack with one command:
#   ./demo.sh
#
# Builds the 2D and 3D demos, starts the MAME real-firmware gateway when a
# binary and ROM are available (skips it cleanly when not), and serves the
# hub on http://localhost:8099/. Ctrl-C stops everything.
set -euo pipefail
cd "$(dirname "$0")"

MAME_BIN="${MOTRONIC_MAME:-/tmp/mame-motronic-mcu-core/motronic175}"
MAME_ROM="${MOTRONIC_ROM:-../ecu/analysis/TotalCombinedROM.bin}"
MAME_PORT="${MAME_PORT:-8098}"

node web/build.js
npm --prefix web3d install --no-audit --no-fund --silent
npm --prefix web3d run build --silent

pids=()
stop_all() { [[ ${#pids[@]} -gt 0 ]] && kill "${pids[@]}" 2>/dev/null || true; }
trap stop_all EXIT INT TERM

if [[ -x "$MAME_BIN" && -f "$MAME_ROM" ]]; then
  node web/gateway/run-mame-gateway.ts \
    --mame "$MAME_BIN" --rom "$MAME_ROM" --port "$MAME_PORT" &
  pids+=($!)
else
  echo "MAME gateway skipped — the hub card will show it as not running."
  echo "  looked for binary: $MAME_BIN"
  echo "  looked for rom:    $MAME_ROM"
  echo "  to build the binary (cold ~4 min, incremental ~7 s):"
  echo "    cd ../ecu/mame-sab80c535-lab/workstreams/accuracy-xdata"
  echo "    MAME_DIR=/tmp/mame-motronic-mcu-core JOBS=4 bash build.sh"
fi

node web/serve.js &
pids+=($!)
wait
