#!/usr/bin/env bash
set -euo pipefail

readonly HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO="$(cd "$HERE/../../../.." && pwd)"
readonly LAB="$REPO/ecu/mame-sab80c535-lab"
readonly E2E="$REPO/ecu/e2e-analysis"
readonly ROM="$REPO/ecu/analysis/TotalCombinedROM.bin"
readonly SCRATCH="/tmp/mame-motronic-accuracy-differential"
readonly COMMIT="a5cc550d0a2cf7218cbd94c1a0780f7a713f8d8e"
readonly ROM_SHA="e262e6aa26ddf6c7c8aa02f636d422709309e0a08945739b84886204d1693e33"
readonly MICRO_SHA="792d863d2543cf14584abe3388c8e4fdb94146de6c7dd1efc0df5aa87a6375ba"
readonly GHIDRA_VERSION="Ghidra-12.1.2"

for tool in git python3 brew; do
	command -v "$tool" >/dev/null || {
		echo "required tool missing: $tool" >&2
		exit 1
	}
done
mkdir -p "$HERE/logs" "$SCRATCH/roms/motronicvalid" \
	"$SCRATCH/roms/motronicstim" "$SCRATCH/cfg"

MAME_DIR="/tmp/mame-motronic-validation"
MAME="$MAME_DIR/motronicvalid"
if [[ ! -x "$MAME" ]]; then
	MAME_DIR="$SCRATCH/mame"
	MAME="$MAME_DIR/motronicvalid"
	MAME_DIR="$MAME_DIR" JOBS=2 bash \
		"$LAB/workstreams/validation-stimuli/build-mame.sh" \
		> "$HERE/logs/mame-build.log" 2>&1
fi
[[ "$(git -C "$MAME_DIR" rev-parse HEAD)" == "$COMMIT" ]] || {
	echo "MAME checkout is not pinned to $COMMIT" >&2
	exit 1
}
[[ -x "$MAME" ]] || {
	echo "pinned MAME executable missing: $MAME" >&2
	exit 1
}

python3 "$HERE/tools/build-microcase.py" "$HERE/logs/microcase.bin"
[[ "$(shasum -a 256 "$HERE/logs/microcase.bin" | awk '{print $1}')" == "$MICRO_SHA" ]]
ln -sfn "$ROM" "$SCRATCH/roms/motronicvalid/totalcombinedrom.bin"
ln -sfn "$HERE/logs/microcase.bin" "$SCRATCH/roms/motronicstim/stimulus.bin"

rm -f "$HERE/logs/mame-reset.trace" "$HERE/logs/mame-reset-console.log"
(
	cd "$HERE"
	"$MAME" motronicvalid -rompath "$SCRATCH/roms" \
		-cfg_directory "$SCRATCH/cfg" -debug -debugger osx \
		-debugscript "$HERE/trace-reset.cmd" -sound none -nothrottle \
		-nosleep -nowriteconfig -skip_gameinfo -oslog \
		> "$HERE/logs/mame-reset-console.log" 2>&1
)
rm -f "$HERE/logs/mame-microcase.trace" "$HERE/logs/mame-microcase-console.log"
(
	cd "$HERE"
	"$MAME" motronicstim -rompath "$SCRATCH/roms" \
		-cfg_directory "$SCRATCH/cfg" -debug -debugger osx \
		-debugscript "$HERE/trace-microcase.cmd" -sound none -nothrottle \
		-nosleep -nowriteconfig -skip_gameinfo -oslog \
		> "$HERE/logs/mame-microcase-console.log" 2>&1
)

readonly GHIDRA="$(brew --prefix ghidra)/libexec/support/analyzeHeadless"
export JAVA_HOME="$(brew --prefix openjdk@21)/libexec/openjdk.jdk/Contents/Home"
[[ -x "$GHIDRA" ]] || {
	echo "Ghidra analyzeHeadless missing: $GHIDRA" >&2
	exit 1
}
rm -rf "$SCRATCH/ghidra-project"
mkdir -p "$SCRATCH/ghidra-project"
"$GHIDRA" "$SCRATCH/ghidra-project" MotronicDifferential \
	-import "$ROM" -processor "8051:BE:16:default" \
	-loader "BinaryLoader" -loader-baseAddr "0x0" -noanalysis \
	-scriptPath "$E2E;$HERE" \
	-postScript "PrepareCombinedMotronic175.java" \
	-postScript "TraceSelectedRoutines.java" "$SCRATCH/fresh-emulator-traces.json" \
	-postScript "TraceBoundedState.java" "$SCRATCH/ghidra-bounded.json" 64 \
	-max-cpu 2 -deleteProject > "$HERE/logs/ghidra-canonical-run.log" 2>&1
python3 "$E2E/validate-traces.py" "$ROM" \
	"$SCRATCH/fresh-emulator-traces.json" \
	-o "$SCRATCH/fresh-validation-summary.json"

rm -rf "$SCRATCH/ghidra-micro-project"
mkdir -p "$SCRATCH/ghidra-micro-project"
"$GHIDRA" "$SCRATCH/ghidra-micro-project" MotronicMicrocase \
	-import "$HERE/logs/microcase.bin" -processor "8051:BE:16:default" \
	-loader "BinaryLoader" -loader-baseAddr "0x0" -noanalysis \
	-scriptPath "$HERE" \
	-postScript "TraceBoundedState.java" "$SCRATCH/ghidra-microcase.json" 18 \
	-max-cpu 2 -deleteProject > "$HERE/logs/ghidra-microcase-run.log" 2>&1

python3 "$HERE/tools/normalize-mame.py" \
	--trace "$HERE/logs/mame-reset.trace" \
	--console "$HERE/logs/mame-reset-console.log" --rom "$ROM" \
	--binary "$MAME" --output "$HERE/logs/mame-canonical.json" \
	--expected-sha "$ROM_SHA" --profile canonical-reset-init --commit "$COMMIT" \
	--command "motronicvalid motronicvalid -debug -debugscript trace-reset.cmd -bound-us 50"
python3 "$HERE/tools/normalize-ghidra.py" \
	--bounded "$SCRATCH/ghidra-bounded.json" \
	--fresh "$SCRATCH/fresh-emulator-traces.json" \
	--validation "$SCRATCH/fresh-validation-summary.json" --rom "$ROM" \
	--output "$HERE/logs/ghidra-canonical.json" --expected-sha "$ROM_SHA" \
	--profile canonical-reset-init --version "$GHIDRA_VERSION" \
	--command "analyzeHeadless MotronicDifferential PrepareCombinedMotronic175 TraceSelectedRoutines TraceBoundedState"
python3 "$HERE/tools/static-trace.py" --rom "$ROM" \
	--output "$HERE/logs/static-canonical.json" --expected-sha "$ROM_SHA" \
	--profile canonical-reset-init --count 31 \
	--command "python3 tools/static-trace.py --profile canonical-reset-init --count 31"

python3 "$HERE/tools/normalize-mame.py" \
	--trace "$HERE/logs/mame-microcase.trace" \
	--console "$HERE/logs/mame-microcase-console.log" \
	--rom "$HERE/logs/microcase.bin" --binary "$MAME" \
	--output "$HERE/logs/mame-microcase.json" --expected-sha "$MICRO_SHA" \
	--profile 8051-core-microcase --commit "$COMMIT" \
	--command "motronicvalid motronicstim -debug -debugscript trace-microcase.cmd -stop-pc 0122"
python3 "$HERE/tools/normalize-ghidra.py" \
	--bounded "$SCRATCH/ghidra-microcase.json" \
	--rom "$HERE/logs/microcase.bin" \
	--output "$HERE/logs/ghidra-microcase.json" --expected-sha "$MICRO_SHA" \
	--profile 8051-core-microcase --version "$GHIDRA_VERSION" \
	--command "analyzeHeadless MotronicMicrocase TraceBoundedState 18"
python3 "$HERE/tools/static-trace.py" --rom "$HERE/logs/microcase.bin" \
	--output "$HERE/logs/static-microcase.json" --expected-sha "$MICRO_SHA" \
	--profile 8051-core-microcase --count 18 \
	--command "python3 tools/static-trace.py --profile 8051-core-microcase --count 18"

compare() {
	python3 "$HERE/tools/run-comparison.py" "$@"
}
compare --stream "mame=$HERE/logs/mame-canonical.json" \
	--stream "static=$HERE/logs/static-canonical.json" \
	--expected-sha "$ROM_SHA" --limit 31 \
	--output "$HERE/logs/mame-static-report.json" --require-agreement
compare --stream "mame=$HERE/logs/mame-canonical.json" \
	--stream "ghidra=$HERE/logs/ghidra-canonical.json" \
	--stream "static=$HERE/logs/static-canonical.json" \
	--expected-sha "$ROM_SHA" --output "$HERE/logs/canonical-exact-report.json"
compare --stream "mame=$HERE/logs/mame-canonical.json" \
	--stream "ghidra=$HERE/logs/ghidra-canonical.json" \
	--stream "static=$HERE/logs/static-canonical.json" \
	--expected-sha "$ROM_SHA" --mask psw=0xfe \
	--output "$HERE/logs/canonical-masked-report.json"
compare --stream "mame=$HERE/logs/mame-microcase.json" \
	--stream "static=$HERE/logs/static-microcase.json" \
	--expected-sha "$MICRO_SHA" --limit 18 \
	--output "$HERE/logs/microcase-mame-static-report.json" --require-agreement
compare --stream "mame=$HERE/logs/mame-microcase.json" \
	--stream "ghidra=$HERE/logs/ghidra-microcase.json" \
	--stream "static=$HERE/logs/static-microcase.json" \
	--expected-sha "$MICRO_SHA" --output "$HERE/logs/microcase-exact-report.json"

python3 "$HERE/tests/test-negative-gates.py" -v \
	2>&1 | tee "$HERE/logs/test-results.txt"
python3 "$HERE/tools/build-coverage.py" \
	--canonical-mame "$HERE/logs/mame-canonical.json" \
	--canonical-ghidra "$HERE/logs/ghidra-canonical.json" \
	--canonical-static "$HERE/logs/static-canonical.json" \
	--canonical-exact "$HERE/logs/canonical-exact-report.json" \
	--canonical-masked "$HERE/logs/canonical-masked-report.json" \
	--canonical-pair "$HERE/logs/mame-static-report.json" \
	--microcase-mame "$HERE/logs/mame-microcase.json" \
	--microcase-ghidra "$HERE/logs/ghidra-microcase.json" \
	--microcase-static "$HERE/logs/static-microcase.json" \
	--microcase-exact "$HERE/logs/microcase-exact-report.json" \
	--microcase-pair "$HERE/logs/microcase-mame-static-report.json" \
	--output "$HERE/logs/coverage-report.json"
python3 "$HERE/tools/write-results.py" "$HERE/logs" "$MAME_DIR" \
	> "$HERE/logs/run-results.txt"
echo "PASS: differential harness completed; see logs/run-results.txt"
