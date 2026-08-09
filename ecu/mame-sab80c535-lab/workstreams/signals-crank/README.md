# Deterministic crank/capture stimulus

This workstream adds an evidence-bounded external CC0 stimulus layer to the
combined `accuracy-xdata` Motronic emulator. It never writes firmware RAM,
sets synchronization flags, or calls firmware workers directly.

## Result

- `src/generate-crank.py` emits timestamped pin levels in integer machine
  cycles using exact rational accumulation.
- `fixtures/scenarios.json` covers stopped, crank, idle, ramp, steady speed,
  dropout, and an electrically sampleable but implausibly close edge.
- Wheel positions, omitted positions, selected edge, pulse width, machine
  cycle rate, and speed are configuration. The bundled geometry is synthetic.
- `patches/sab80c515-cc0-capture.patch` adds one external P1.0/INT3/CC0 line
  to the validated MCU patch. A selected edge schedules CRC capture one cycle
  later and requests IEX3 only when the captured value is committed.
- `patches/motronic175-crank-driver.patch` loads a strict two-column trace and
  schedules each level with `cycles_to_attotime`; it reports applied
  transitions and entries at vector `0053`.
- The generated 2 KiB test ROM and `sab515cap` driver check the capture delta,
  edge selection, automatic IEX3 clear, and capture-before-vector ordering.

See `firmware-evidence.md` for the binary/manufacturer evidence boundary.

## Pure verification

Run:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 verify.py
```

The passing gates cover every scenario, exact repeatability, configurable gap
timing, dropout time advancement, the inserted implausible edge, invalid
geometry and unsampleable waveforms, generated-ROM identity, patch bypass
prohibitions, and the 250-line file limit.

The checked-in ROM identity is:

- CRC32 `dcfd8ed7`
- SHA-1 `c0cc7558d64523d067ffa4049c8869a8c64d9e94`
- SHA-256 `17c103883c18331b799ec25f560f7bb0a780878093dfd4d139eb845a1cfd8dd0`

Regenerate the ROM and test-driver patch with:

```sh
python3 tests/build-capture-rom.py
python3 tools/export-driver-patch.py
```

## Generate a trace

For example:

```sh
python3 tools/generate-trace.py idle \
  --output artifacts/idle.csv
```

The CSV contains only `cycle,level`; comments begin with `#`. Level 1 maps to
`ASSERT_LINE` (physical high for this custom pin), level 0 to `CLEAR_LINE`.
The adjacent JSON records geometry and per-phase capture counts.

No profile is identified as production Motronic geometry. In particular, this
workstream makes no 60-2 claim.

## Later integration and one incremental build

Prepare the pinned MAME tree with the existing `accuracy-xdata/build.sh`
installation first. Then, from this directory, run exactly one incremental
make invocation through:

```sh
MAME_DIR=/path/to/prepared/mame JOBS=4 ./build-incremental.sh
```

The script does not clone or clean MAME. It idempotently applies, in order:

1. the CC0 MCU input patch;
2. the combined Motronic trace-driver patch;
3. the generated conformance-driver patch.

This build was intentionally not run while creating the workstream, because
the task prohibits building MAME and modifying the existing scratch checkout.

Run the external-capture oracle after integration:

```sh
python3 tests/run-capture-test.py \
  --mame "$MAME_DIR/motronic175" \
  --run-dir /tmp/sab515cap-run
```

Expected output contains:

```text
SAB515CAP result=00 transitions=4
```

The driver holds high from cycle 40, presents falling edges at cycles 200 and
321, and a non-selected rising edge at 204. CRC captures occur one modeled
cycle after each falling edge, so their modulo-16-bit difference is exactly
121. IEX3 is cleared on vector acceptance, and vector `0053` is entered twice.

Run a generated waveform twice through the combined firmware:

```sh
python3 tests/run-motronic-stimulus.py \
  --mame "$MAME_DIR/motronic175" \
  --rom ../../../analysis/TotalCombinedROM.bin \
  --trace artifacts/idle.csv \
  --run-dir /tmp/motronic-crank-run \
  --log artifacts/idle-runtime.log
```

This gate requires every scheduled transition to be applied and both
`ESUMMARY` dictionaries to match. `capture_entries` is reported, not forced:
whether the firmware enables EX3 and accepts a given pattern remains firmware
behavior.

## Files

- `firmware-evidence.md`: exact channels, SFRs, edges, vectors, and provenance.
- `src/`: immutable contracts, pure generator, and trace renderer.
- `fixtures/scenarios.json`: synthetic scenario catalog.
- `patches/`: MCU, combined driver, and conformance driver diffs.
- `source/sab80c515-capture-test.cpp`: review copy of the generated-ROM driver.
- `tests/build-capture-rom.py`: small 8051 ROM assembler/oracle.
- `tests/test-*.py`: pure generator, ROM, and negative gates.
- `tests/run-*.py`: later MAME conformance and deterministic-runtime gates.
- `artifacts/sab80c515-capture-test.bin`: reproducible generated ROM.

## Remaining MCU timing gaps

- MAME still has no S5P2 sub-cycle pin sampler. The patch delays IEX3 visibility
  until the following-cycle capture commit so an ISR cannot observe stale CRC.
  This preserves required ordering but does not claim phase-exact request time.
- Capture currently commits before the Timer-2 increment in the modeled cycle.
  Same-cycle edge/overflow ordering needs a hardware timing trace.
- The custom CC0 line does not alter ordinary `MOV A,P1` pin reads.
- External capture inputs CC1 to CC3 are not added because this firmware has no
  proven CC1 consumer and uses CC2/CC3 as scheduled outputs.
- Exact compare-mode 0/1 pin waveforms, shadow-latch transparency, and
  compare-output transitions for CC2/CC3 remain absent.
- The core still lacks the manual's one-instruction recognition delay after
  interrupt-control writes.
- Sensor conditioning, minimum analog pulse amplitude, oscillator frequency,
  production wheel geometry, and PCB routing remain unresolved.
