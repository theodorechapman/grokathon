# Motronic MAME validation and stimulus harness

## Result

This workstream builds and runs at MAME commit
`a5cc550d0a2cf7218cbd94c1a0780f7a713f8d8e`. It preserves the baseline
canonical-ROM reset proof and adds fail-hard, machine-readable oracles for PCs,
cycles, SFR/XDATA accesses, interrupt-vector entries, inputs, and port
transitions.

The canonical and surrogate runs are deliberately separate:

- `motronicvalid` runs the 40 KiB canonical ROM. Its XDATA map still backs only
  `a040-a041`; the harness does not invent Bosch ASIC behavior.
- `motronicstim` runs the included 4 KiB test firmware. Its observation RAM,
  ADC values, generic interrupt, UART waveform, and pin toggles are test
  fixtures. They are not canonical-ROM, engine, vehicle, or electrical
  behavior.

All repository outputs are confined to this directory. The baseline lab,
analysis artifacts, ROM, cleanroom, and other workstreams were not modified.

## Reproduce

Prerequisites match the baseline lab: Git, Python 3, GNU Make, Apple Clang, and
Homebrew SDL2.

```bash
cd /Users/matcha/Code/grokathon/ecu/mame-sab80c535-lab/workstreams/validation-stimuli
./build-mame.sh
./run-tests.sh
```

The default checkout is `/tmp/mame-motronic-validation`; override it with
`MAME_DIR`. The run directory is `/tmp/mame-motronic-validation-run`. On a
platform with another MAME debugger frontend, set `MAME_DEBUGGER`.

The executed build command and binary hash are in `logs/build-results.txt`.
The full executed test output is in `logs/test-results.txt`. Every subprocess
used by the Python runner has a hard timeout, and any nonzero result aborts.
`logs/determinism-results.txt` records a second complete run whose two
normalized event streams were byte-identical to the first.

## Runtime-verified capabilities

Canonical ROM, bounded to 50 microseconds:

- ROM size `0xa000`, SHA-256
  `e262e6aa26ddf6c7c8aa02f636d422709309e0a08945739b84886204d1693e33`.
- 31 cycle-tagged PC observations through cycle 48.
- Exact prefix `0000, 0073, 0075, 0077, 0079, 007b, 20e0, 5c00`;
  `5c00` is observation 8 at machine cycle 11.
- Runtime SFR read at `a9` and XDATA write `01` at `a081`.
- Exact agreement with both reset paths in
  `traces/validation-summary.json` and `traces/emulator-traces.json`.

Surrogate firmware, bounded to 2,500 microseconds:

- 1,244 PC, 124 access, 22 interrupt-entry, and 14 input observations.
- ADC callbacks for channels 0 and 1 returned `12` and `34`; upstream ADDAT
  produced `24` and `68`, which firmware wrote to XDATA `a100-a101`.
- A scheduled generic external-0 pulse entered vector `0003` at cycle 500 and
  wrote marker `e0` to `a110`.
- Generic Timer-0 entered vector `000b` 19 times and drove the required P1.5
  subsequence `ac -> 8c -> ac`.
- Generic UART transmitted `a5`, received an 8N1 `3c` waveform, entered vector
  `0023` twice, and wrote both bytes in order to `a112`. P3 TX transitions were
  observed through the port callback.

These facts come from newly produced debugger traces and driver callback logs.
Static expected strings are never a positive runtime result.

## Negative gates

`tests/test-negative-gates.py` proves that the oracle rejects:

- wrong ordered PCs;
- non-monotonic cycle counts;
- wrong cycle for a required PC;
- absent hardware-access evidence;
- wrong ROM content.

The positive gates require a runtime provenance record, debugger-produced PC
events, and driver-produced access events. Missing or malformed logs fail.

## Event contract

`tools/trace-normalizer.py` combines debugger traces and `EVT` JSON from the
driver into cycle-ordered NDJSON. The first record contains ROM, MAME commit,
profile, command, and runtime provenance. Remaining records use:

- `pc`: instruction boundary and machine cycle;
- `access`: `sfr`, `xdata`, or `port`, direction, address, and byte;
- `interrupt`: a vector entry derived from an observed runtime PC;
- `input`: scheduled line state or ADC callback value;
- `run`: driver profile and wall-time bound.

`tools/trace-oracle.py` consumes a JSON gate. New core or XDATA work can add
requirements without changing the parser.

## Evidence-backed stimuli

`fixtures/ecu-stimuli.json` defines the recovered logical interfaces and cites
`hardware-model.json` plus subsystem specifications:

- external-3/CC0 crank capture;
- ADC channels;
- P3.0/SBUF diagnostic UART input;
- Timer0/P1.5 ignition output;
- CC2/P1.2 and CC3/P1.3 injector outputs;
- Timer1/P1.7 IAC output.

Raw values and edge intervals are deterministic plumbing fixtures. Unknown
tooth geometry, ADC transfer functions, physical channel identities, baud
initialization, actuator wiring, and electrical loads are explicitly excluded.

## Blocked in current upstream MAME

The following are not runtime-verified canonical behavior:

- Siemens external-3/CC0, IRCON, CCEN, CCL/CCH, and compare/capture interrupts;
- Siemens `IP0`, `IEN1`, `IP1`, DAPR, P6, watchdog, and correct Timer-2 model;
- ADC conversion timing, busy/completion state, and ADC interrupt;
- CC2/P1.2 and CC3/P1.3 compare-driven injector edges;
- canonical Timer1/P1.7 IAC PWM;
- Bosch ASIC/XDATA registers, XRAM paging, crank wheel, K-line electrical
  interface, coils, injectors, or idle valve.

Generic external-0 and UART tests validate MAME callback and scheduling
plumbing only. They do not substitute for SAB80C515 external-3 or KW71
semantics. The test ROM is never cited as canonical-ROM evidence.

## Integration guidance

Core workstream:

1. Apply `mame/motronic-validation.patch` after the core patch.
2. Build the same reduced target and run `./run-tests.sh`.
3. Treat any reset PC/cycle differential as a regression unless the core
   change has independent timing evidence.

XDATA/peripheral workstream:

1. Keep canonical and surrogate maps separate.
2. Emit the same `EVT` access/input/port contract from new devices.
3. Add evidence-backed access and transition requirements to a new gate; never
   weaken an old requirement to make a run pass.
4. Preserve unknown-access evidence until an implemented register has a cited
   semantic model and dedicated positive/negative tests.

## Gates before calling the emulator ECU-useful

1. **Identity:** pinned MAME, exact canonical ROM, patch identity, and bounded
   command provenance must pass.
2. **Determinism:** two clean runs must produce identical normalized events
   after excluding filesystem paths.
3. **Core regression:** exact reset PC order, cycle 11 arrival at `5c00`, and
   Ghidra differential must remain green.
4. **Access accountability:** every modeled SFR/XDATA access must be logged;
   every unmodeled access must fail an allowlist gate rather than read as
   plausible hardware silently.
5. **SAB peripheral conformance:** real external-3/CC0 capture, extended
   interrupt priority/request behavior, ADC lifecycle, CC2/CC3 compare, and
   watchdog tests must pass against datasheet-derived timing fixtures.
6. **Canonical causality:** canonical firmware must reach scheduler/foreground
   states because supplied inputs caused observed state transitions, not
   because a test ROM or debugger patched state.
7. **Actuator timing:** canonical crank stimuli must causally produce bounded
   P1.5, P1.2, P1.3, and P1.7 transitions with interrupt and register evidence.
8. **Fault behavior:** missing teeth, timer rollover, ADC extremes, malformed
   serial frames, absent XDATA devices, and watchdog expiry must each take a
   specified recovery path.

Today gates 1-3 pass, event plumbing for gate 4 is exercised, and the surrogate
covers parts of the future conformance harness. Gates 5-8 remain required
before claiming ECU-level usefulness.
