# Motronic 1.7 board-I/O signals

This workstream supplies an evidence-bounded signal provider for XDATA reads at
`A040/A041` and external digital levels on `P3/P5/P6`. It is a drop-in sibling
of `accuracy-xdata`; no existing source or MAME tree was modified.

## What is modeled

- `A040.0` can hold startup in `5CE5..5D08` and release it to `5D0A`.
- Later `A040` reads feed input state through XOR `1E`, with a mask at `33A0`.
- `A041` reads feed a second input byte through XOR `02`.
- P3.4 and P5.0/P5.2/P5.3/P5.4 have explicit branch-sensitive read sites.
- P6 is configurable as a digital byte, but the canonical program model has no
  direct P6 read; ADC acquisition uses `ADDAT`.
- Writes to `A040/A041` remain separate output latches. They cannot alter
  provider input values.

`EVIDENCE.md` gives the proven branch effects, domain corroboration, and
assumption boundary. The JSON fixtures preserve the same distinctions.

## Named scenarios

Set `MOTRONIC_SIGNAL_SCENARIO` to one of:

- `key-on`: A040.0 is high until cycle 4096, then releases.
- `crank`: key-on release plus a bounded P3.4-low branch stimulus. Actual CC0
  capture edges still require an engine-position provider.
- `idle`: release to raw A040 `40`; if input-mask bits 4/6 are enabled, this
  selects the domain-corroborated idle logical entry 3.
- `part-load`, `wot`, `overrun`: the same neutral board-I/O envelope. Static
  evidence does not justify inventing unique digital mode bits.
- `fault-inputs`: independent raw stuck/low/rail injections, including A040.0
  stuck high. It is not claimed as one coherent vehicle fault.

The provider defaults to `off`, preserving `accuracy-xdata` strict-unknown
behavior. Existing `MOTRONIC_INPUTS` entries override provider XDATA values and
retain their old taint behavior.

Append deterministic overrides with:

```text
MOTRONIC_SIGNAL_SCRIPT=100:a040=aa,200:p5=7f,300:p3=ef
```

Cycles are decimal; values are hexadecimal bytes. Supported targets are
`a040`, `a041`, `p3`, `p5`, and `p6`. Invalid scenarios, targets, bytes, or
scripts fail configuration.

## One-build integration

From `accuracy-xdata`, apply the patch:

```sh
patch -p1 < ../signals-board-io/patches/accuracy-xdata-signals.patch
MAME_DIR=/path/to/already-prepared-mame ./build.sh
```

The patch makes `build.sh` install this workstream's provider source, adds it
to the reduced target, routes P3/P5/P6 callbacks through it, and supplies
machine-cycle time from the instruction callback. It does not request a clean
or broad MAME build.

Example later run:

```sh
MOTRONIC_XRAM_RESET=zero \
MOTRONIC_SIGNAL_SCENARIO=key-on \
MOTRONIC_UNKNOWN_POLICY=value \
MOTRONIC_UNKNOWN_VALUE=00 \
/path/to/motronic175 motronic175 -video none -sound none -nothrottle -oslog
```

Unknown XDATA outside modeled reads remains governed by the existing strict or
approximation policy.

## Pure verification

No MAME build is needed:

```sh
./run-tests.sh
```

The test gate:

- compiles and exercises the standalone C++ provider;
- checks all named scenarios, script overrides, and invalid input rejection;
- revalidates exact ROM instructions and existing runtime branch evidence;
- proves no direct canonical P6 read is exported;
- dry-runs the integration patch against `accuracy-xdata`;
- rejects any provider write-back API or added output-latch readback path;
- enforces the under-250-line file limit.

## Artifacts

- `src/motronic175-signal-provider.{h,cpp}`: dependency-free provider.
- `fixtures/scenarios.json`: raw values, events, qualifications, and exclusions.
- `fixtures/access-semantics.json`: access-specific evidence ledger.
- `patches/accuracy-xdata-signals.patch`: one-build integration.
- `tests/`: standalone implementation and evidence gates.

This provider is not an engine plant. It does not supply CC0 tooth geometry,
ADC voltages, sensor transfer functions, electrical loading, or connector-pin
routing.
