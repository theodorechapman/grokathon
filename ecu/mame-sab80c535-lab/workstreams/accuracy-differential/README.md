# Motronic execution differential

This workstream performs bounded, fail-closed comparison of:

1. fresh canonical-ROM execution in pinned MAME;
2. fresh Ghidra 12.1.2 EmulatorHelper reset, initialization, and lookup runs;
3. an independent raw-ROM 8051 subset decoder.

It is differential software evidence, not a claim that any engine accurately
models the ECU.

## Reproduce

Requirements are Python 3, Git, Homebrew Ghidra 12.1.2, OpenJDK 21, and the
MAME prerequisites documented by the parent lab.

```bash
cd /Users/matcha/Code/grokathon/ecu/mame-sab80c535-lab/workstreams/accuracy-differential
bash run.sh
```

`run.sh` uses `/tmp/mame-motronic-validation/motronicvalid` only when its
checkout is at commit `a5cc550d0a2cf7218cbd94c1a0780f7a713f8d8e`.
If absent, it invokes the existing reduced-target build with `JOBS=2` into
`/tmp/mame-motronic-accuracy-differential/mame`.

The script runs the existing `PrepareCombinedMotronic175.java`,
`TraceSelectedRoutines.java`, and `validate-traces.py` from `e2e-analysis`
without writing there. Full fresh EmulatorHelper lookup output remains in
scratch. Only bounded normalized evidence and small logs are retained here.

To rerun only the negative gates after a complete run:

```bash
python3 tests/test-negative-gates.py -v
```

Exact executed commands and concise results are in `logs/run-results.txt`.
The complete orchestration, including every argument, is `run.sh`.

## Results

Canonical ROM identity is 40,960 bytes with SHA-256
`e262e6aa26ddf6c7c8aa02f636d422709309e0a08945739b84886204d1693e33`.

- Fresh Ghidra lookup validation passed 100/100 cases.
- MAME and the independent static decoder agree exactly for all 31 retained
  canonical boundaries, from `0000` through `5c2a`, including machine cycles
  `0` through `48`, common registers, and observable SFR/XDATA accesses.
- Three-way exact agreement is 12 boundaries (`0000` through `5c0a`).
- The first exact divergence is ordinal 12, PC `5c0c`, `PSW`: MAME and the
  static 8051 expectation report `0x01`; EmulatorHelper reports `0x00`.
  This is classified `cpu_semantics` and exposes EmulatorHelper's missing
  accumulator-parity side effect in this execution profile.
- With only PSW parity bit 0 masked (`psw=0xfe`), all 31 common retained
  boundaries agree. The next result is not equality: at ordinal 31 Ghidra has
  PC `5c2b`, while the bounded MAME/static streams have ended. It is reported
  as `unavailable_evidence`.

The microcase ROM exercises ADD/SUBB flags, PUSH/POP, MOVC, MOVX, bit
CLR/SETB/JB, and taken-branch timing:

- MAME and independent static expectations agree exactly for all 18
  boundaries through terminal PC `0122`.
- Three-way agreement ends after two boundaries. At ordinal 2, PC `0103`,
  MAME/static report SP `0x30` after `MOV SP,#0x30`; EmulatorHelper still
  reports SP `0x07`. This is a `cpu_semantics` register/SFR alias divergence.
- The MAME checksum warning for this generated 4 KiB ROM is expected: the
  existing `motronicstim` system is deliberately reused as an execution
  container. The generated ROM hash is pinned and checked separately.

Ghidra's initial SP `0x07` and R0-R7 zero values are explicit comparison
fixtures because EmulatorHelper warns that these registers are otherwise
uninitialized. They are recorded in provenance and are not evidence that
EmulatorHelper implements hardware reset state.

## Strict negative gates

All eight gates pass by proving rejection or first-divergence detection for:

- corrupted ROM;
- altered PC;
- non-monotonic cycles;
- dropped access;
- changed register;
- fabricated provenance;
- the known Siemens `IEN1` / inherited generic MAME `IP` alias divergence;
- unavailable Ghidra cycle and peripheral-access fields.

Missing runtime logs, malformed events, wrong ROM identity, incomplete
provenance, and unsupported static opcodes are hard failures.

## Coverage and artifacts

`logs/coverage-report.json` is the authoritative machine-readable summary. It
contains per-engine instruction counts, unique opcodes, address ranges, cycle
spans, access counts/ranges, interrupts, availability, compared/unmatched
field counts, exact and masked first divergences, lookup totals, and microcase
coverage.

Key retained artifacts:

- `event-contract.md`: normalized event and comparison rules.
- `TraceBoundedState.java`: bounded EmulatorHelper register trace.
- `tools/normalize-*.py`: runtime evidence normalizers.
- `tools/static-trace.py`: fail-closed independent subset semantics.
- `tools/compare-traces.py`: first-divergence core.
- `tests/test-negative-gates.py`: required corruption gates.
- `logs/mame-*.trace` and `logs/*-run.log`: raw bounded runtime evidence.
- `logs/*-report.json`: comparison results.
- `logs/coverage-report.json`: consolidated coverage.
- `logs/run-results.txt` and `logs/test-results.txt`: exact run summary.

## What this does not validate

This does not validate Bosch ASIC behavior, full XDATA mapping, real
SAB80C515 peripheral semantics, interrupt timing, watchdog behavior, ADC
conversion lifecycle, crank/capture inputs, UART electrical behavior,
oscillator tolerance, actuator outputs, PCB wiring, vehicle behavior, fault
handling, or safety.

Ghidra supplies no cycle evidence or memory-access callbacks here. MAME's
canonical driver does not expose IDATA accesses and still has known Siemens
SFR/peripheral gaps. The static decoder supports only opcodes encountered in
the retained canonical prefix and microcases. Agreement therefore means only
that the compared, available fields matched for the stated bounded events.
