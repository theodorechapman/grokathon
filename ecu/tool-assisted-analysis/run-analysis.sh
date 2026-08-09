#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="$ROOT/ecu/tool-assisted-analysis"
BIN="$ROOT/ecu/318i_175_soft1267356378.bin"
XDF="$ROOT/ecu/BMW_175_318i_soft378.xdf"
GHIDRA="$(brew --prefix ghidra)/libexec/support/analyzeHeadless"
PROJECT_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/motronic175-ghidra.XXXXXX")"
JAVA_HOME="$(brew --prefix openjdk@21)/libexec/openjdk.jdk/Contents/Home"
export JAVA_HOME

python3 "$OUT/analyze-xdf.py" "$BIN" "$XDF" \
  -o "$OUT/xdf-analysis.json"

"$GHIDRA" "$PROJECT_ROOT" Motronic175 \
  -import "$BIN" \
  -processor "8051:BE:16:default" \
  -loader "BinaryLoader" \
  -loader-baseAddr "0x0" \
  -noanalysis \
  -scriptPath "$OUT" \
  -postScript "PrepareMotronic175.java" \
  -postScript "ExportMapCallsites.java" "$OUT/master-map-callsites.json" \
  -postScript "ExportGhidraReport.java" "$OUT/ghidra-report.json"

python3 "$OUT/analyze-map-usage.py" \
  "$BIN" "$OUT/xdf-analysis.json" "$OUT/master-map-callsites.json" \
  -o "$OUT/map-usage.json"
python3 "$OUT/analyze-descriptors.py" \
  "$BIN" "$OUT/xdf-analysis.json" "$OUT/map-usage.json" \
  -o "$OUT/descriptors.json"
python3 "$OUT/synthesize-analysis.py" \
  --binary "$BIN" \
  --xdf "$OUT/xdf-analysis.json" \
  --descriptors "$OUT/descriptors.json" \
  --usage "$OUT/map-usage.json" \
  --ghidra "$OUT/ghidra-report.json" \
  -o "$OUT/analysis-report.json"

echo "Analysis written to $OUT"
echo "Ghidra project retained at $PROJECT_ROOT"
