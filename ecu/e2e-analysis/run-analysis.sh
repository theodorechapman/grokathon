#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="$ROOT/ecu/e2e-analysis"
COMBINED="$ROOT/ecu/analysis/TotalCombinedROM.bin"
EXTERNAL="$ROOT/ecu/318i_175_soft1267356378.bin"
XDF="$ROOT/ecu/BMW_175_318i_soft378.xdf"
XDF_ANALYZER="$ROOT/ecu/tool-assisted-analysis/analyze-xdf.py"
GHIDRA="$(brew --prefix ghidra)/libexec/support/analyzeHeadless"
PROJECT_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/motronic-e2e.XXXXXX")"
JAVA_HOME="$(brew --prefix openjdk@21)/libexec/openjdk.jdk/Contents/Home"
export JAVA_HOME
mkdir -p "$OUT/traces"

python3 "$OUT/build-manifest.py" \
  "$EXTERNAL" "$COMBINED" -o "$OUT/manifest.json"
python3 "$XDF_ANALYZER" \
  "$EXTERNAL" "$XDF" -o "$OUT/xdf-analysis.json"

"$GHIDRA" "$PROJECT_ROOT" MotronicE2E \
  -import "$COMBINED" \
  -processor "8051:BE:16:default" \
  -loader "BinaryLoader" \
  -loader-baseAddr "0x0" \
  -noanalysis \
  -scriptPath "$OUT" \
  -postScript "PrepareCombinedMotronic175.java" \
  -postScript "ExportLookupCallsites.java" "$OUT/lookup-callsites.json" \
  -postScript "ExportProgramModel.java" "$OUT/program-model.json" \
  -postScript "TraceSelectedRoutines.java" "$OUT/traces/emulator-traces.json"

python3 "$OUT/analyze-calibrations.py" \
  "$COMBINED" "$OUT/xdf-analysis.json" "$OUT/lookup-callsites.json" \
  -o "$OUT/calibration-index.json"
python3 "$OUT/build-function-catalog.py" \
  "$OUT/program-model.json" "$OUT/calibration-index.json" \
  -o "$OUT/function-catalog.json" --symbols "$OUT/symbols.json"
python3 "$OUT/build-runtime-model.py" \
  "$OUT/program-model.json" -o "$OUT/runtime-state.json" \
  --lookup "$OUT/lookup-dataflow.json" --symbols "$OUT/symbols.json"
python3 "$OUT/analyze-lookup-configuration.py" \
  "$COMBINED" "$OUT/program-model.json" "$OUT/lookup-dataflow.json" \
  "$OUT/calibration-index.json" -o "$OUT/lookup-configuration.json"
python3 "$OUT/build-hardware-model.py" \
  "$OUT/program-model.json" -o "$OUT/hardware-model.json"
python3 "$OUT/analyze-integrity.py" \
  "$COMBINED" "$OUT/program-model.json" -o "$OUT/integrity.json"
python3 "$OUT/validate-traces.py" \
  "$COMBINED" "$OUT/traces/emulator-traces.json" \
  -o "$OUT/traces/validation-summary.json"
python3 "$OUT/build-scenario-fixtures.py" \
  "$COMBINED" "$OUT/traces/emulator-traces.json" \
  -o "$OUT/traces/scenarios.json"
python3 "$OUT/audit-completion.py" \
  "$OUT" -o "$OUT/completion-audit.json"

echo "Analysis written to $OUT"
echo "Ghidra project retained at $PROJECT_ROOT"
