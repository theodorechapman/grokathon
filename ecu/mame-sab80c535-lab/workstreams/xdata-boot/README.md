# Motronic XDATA/Bosch ASIC startup proof

## Outcome

This workstream advances the canonical firmware beyond the baseline MAME
proof without treating all XDATA as RAM. The baseline stopped after 31 PC
observations at cycle 48, during the write to `a003`, with startup frontier
`5c00`.

The modeled run records 241 loop-compressed PC observations and exactly 2,408
instruction callbacks. It requests a stop at machine cycle 3,848 after reaching
startup PC `5cd3`; the highest numeric PC reached is `9015` during cold-XRAM
initialization. There is one `5c00` entry, no restart, 16 repeated Timer-2
vector entries, and no foreground-loop entry.

The first blocker is not XDATA. After `5cd3` writes the Siemens `T2CON` value
`85`, MAME's inherited Intel 8052 Timer-2 implementation repeatedly vectors to
`002b -> 2070`. The earlier unmapped Siemens `IP0` SFR `a9` remains visible but
does not prevent this deeper progress. Startup never reaches the first unknown
ASIC read at `5cea`, so the normal run reports zero unknown XDATA reads.

No sensor, crank, port, or actuator input is injected.

## Address reconstruction

Evidence tiers used here:

- **Proven** means an instruction sequence directly establishes the access or
  read/write behavior.
- **Corroborated** means the authoritative runtime state and subsystem analyses
  agree with the instruction sequence.
- **Approximation** is behavior supplied only to test execution and is called
  out in code, logs, and this document.
- **Unknown** means no physical register semantics or reset value is claimed.

The ordered direct startup writes are:

1. `5c0c: a081=01`
2. `5c12: a010=81`; `5c16: a011=81`
3. `5c1c: a040=ff`; `5c20: a041=ff`
4. `5c26–5c32: a002-a005=00`
5. `5c38–5c3c: a008-a009=00`
6. `5c42: a021=d7`; `5c48: a020=ff`
7. `5c4e: 0162=d7`

`P2` then supplies the high byte for `MOVX @R0`:

- `5c54` reads marker `0000` and compares it with `55`.
- On a valid first marker, `5c60` reads `015a` and compares it with the
  complement. A valid pair makes `5c69/5c6f` read and update retained byte
  `015b`.
- On an invalid pair, `5c78` clears `015b`.
- `5c81` reads `015b`. Zero takes the cold path and writes `020b=00`,
  `020c=aa`; nonzero takes the warm path and reads `020c` at `5c97`.
- On the observed cold path, later first reads are `015b` at `8f9c` and
  `00c2` at `8fe3`.
- Static disassembly shows the next ASIC read would be `a040` at `5cea`; its
  bit 0 feeds the decision at `5cef`. Runtime does not reach it because of the
  Timer-2 blocker.

The classifications are access-specific:

- `0300-03ff` is **proven storage**. `8faa–8fb7` clears the complete range and
  record consumers read and write it.
- `0000`, `015a-015b`, `0162`, and `020b-020c` are **retained RAM/state** by
  marker and later read/write behavior.
- The contiguous `0000-03ff` backing used by the device is a bounded
  **1 KiB XRAM approximation** over the firmware's paged state space. Its
  decode width, physical technology, retention source, and zeroed power-on
  contents are not proven.
- Writes to `a040/a041` are **write-only output-latch semantics**; reads at the
  same addresses are independent **input/status semantics**. Writes are
  retained only for reporting and are never returned by reads.
- `a081` is **unknown** on write and **input/status unknown** on its later read
  at `2fd3`; readback equivalence is not assumed.
- `a002-a005`, `a008-a011`, and `a020-a021` remain **unknown ASIC registers**.
  Their writes are logged and ignored.
- Every other unknown read returns explicit open bus `ff` and is logged.

The machine-readable classification and complete ordered list are in
`address-model.json`.

## Approximation sensitivity

`run.sh` also runs with `MOTRONIC_XRAM_DISABLE=1`. Writes into `0000-03ff` are
then ignored and reads return open bus `ff`.

The traces first diverge after the `5c81` read:

- modeled storage retains the preceding `015b=00` write and executes `5c84`;
- disabled storage reads `015b=ff` and executes `5c92`.

The disabled case also skips the bulk cold clear. This is runtime proof of the
specific behavior that depends on the XRAM approximation, not evidence for the
physical RAM implementation.

## Instrumentation

The MCS-51 patch adds an optional per-instruction callback. The driver uses it
for exact instruction counts, PCs, startup frontier, restart count, Timer-2
loop detection, and foreground detection.

The XDATA device records the first PC and value for every distinct
operation/address pair. A run stops if more than 512 pairs appear; the verified
model records 405 and reports no overflow. Unknown reads also record the first
known static decision that consumes their value. The disabled-XRAM trace
records `5c54 -> 5c55`; comparison of both traces identifies the first actual
path divergence at `5c84` versus `5c92`.

`cycles` in `EXEC summary` is captured when the stop is requested.
`exit_cycles` is MAME's scheduler total after the exit request and is preserved
for transparency, but is not used as the bounded execution count.

## Reproduce

Prerequisites are Git, Python 3, GNU Make, Apple Clang, Xcode Command Line
Tools, and Homebrew SDL2 (`sdl2-config`). Build products remain under `/tmp`.

```bash
cd /Users/matcha/Code/grokathon/ecu/mame-sab80c535-lab/workstreams/xdata-boot
MAME_DIR=/tmp/mame-motronic-xdata JOBS=4 ./build.sh
MAME_DIR=/tmp/mame-motronic-xdata ./run.sh
python3 test-evidence.py \
  --rom /Users/matcha/Code/grokathon/ecu/analysis/TotalCombinedROM.bin
```

`build.sh` requires MAME commit
`a5cc550d0a2cf7218cbd94c1a0780f7a713f8d8e`, applies the two small patches,
copies the three driver/device sources into the scratch checkout, and builds
the reduced `motronic175` target.

`run.sh` executes the modeled and disabled-XRAM cases, regenerates
`runtime-summary.json`, and runs the evidence test. The test verifies the
40,960-byte ROM and SHA-256
`e262e6aa26ddf6c7c8aa02f636d422709309e0a08945739b84886204d1693e33`,
ordered reset and XDATA paths, exact deeper PCs, artifact hashes, runtime
provenance, instrumentation completeness, and source line limits.

## Artifacts and remaining work

- `src/`: custom driver and XDATA device, all below 250 lines.
- `patches/`: MCS-51 instruction callback and driver registration.
- `runtime-model-*.log`: principal bounded runtime evidence.
- `runtime-no-xram-*.log`: approximation-sensitivity evidence.
- `runtime-summary.json`: counts, stop reason, hashes, and comparison.
- `analyze-traces.py`, `test-evidence.py`: summary and hard verification gate.

Remaining unknowns are all `a0xx` register meanings and reset values, read
semantics of `a040/a041/a081`, the physical XRAM decode/retention technology,
and every sensor or crank input. The next runtime dependency is a correct
Siemens SAB80C515 Timer-2/extended-interrupt model; changing XDATA cannot
defensibly bypass that blocker.
