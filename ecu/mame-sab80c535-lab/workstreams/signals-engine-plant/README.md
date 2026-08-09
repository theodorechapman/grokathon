# Deterministic Motronic signal source

This workstream produces replayable, time-ordered input bytes, logical
observation hooks, and pure live-controller primitives for the combined
`accuracy-xdata` emulator. The fixed-point demo plant is explicitly assumed
bench behavior, not an engine, vehicle, Bosch ASIC, electrical, or physical-unit
simulation. The browser plant in `cleanroom/web/app/engine-plant.ts` supplies
control-flow shape only; none of its numeric constants are imported.

## Reproduce

No package dependency is required. With a recent Node.js and TypeScript:

```sh
cd ecu/mame-sab80c535-lab/workstreams/signals-engine-plant
npm test
npm run typecheck
npm run fixtures
```

These are pure generator/adapter tests. They do not clone, build, or run MAME.

## Artifacts

- `contract/schema-v1.json` is the machine-readable JSON Schema.
- `contract/runtime-bridge-v1.schema.json` is the strict peripheral-only
  lockstep command, response, input-event, and telemetry-event schema.
- `src/signal-contract.ts` is the matching strict TypeScript contract.
- `src/runtime-bridge-types.ts` and `src/validate-runtime-bridge-*.ts` provide
  strict TypeScript bridge types and dependency-free runtime validation.
- `src/advance-demo-plant.ts` is the fixed-step integer demo plant; every
  selected constant is paired with provenance in `src/demo-plant-constants.ts`.
- `src/schedule-next-crank-pulse.ts` emits only the next adaptive CC0 pulse,
  retaining exact fractional phase remainder across live RPM changes.
- `src/synthetic-crank-geometry.ts` discloses the configurable
  12-position/one-gap, two-cycle-pulse fixture and its provenance.
- `src/scenario-specs.ts` defines ten compact source profiles.
- `src/generate-scenario.ts` performs deterministic interpolation, quantization,
  dither, and crank-edge generation.
- `src/adapt-accuracy-xdata.ts` compiles a scenario to ordered driver events.
- `src/observe-outputs.ts` reduces an emulator trace through logical hooks.
- `fixtures/scenarios-v1.json` is the complete compact fixture suite.
- `fixtures/key-on-plan.ndjson` is an example adapter stream.
- `integration/accuracy-xdata.patch` adds the narrow dynamic-XDATA setter and
  cycle-tagged P1 observation prerequisite to the current combined target.

## Contract shape

Every scenario has schema tag `motronic-signals/v1` and contains:

- a uint32 seed and explicit assumption records with sources and exclusions;
- a 10 kHz `bench-tick` scheduling grid, 100-tick ADC/status samples, linear
  interpolation, nearest-ties-up byte rounding, and unsigned-byte saturation;
- full frames containing A040/A041/A081 input values, all eight raw ADC bytes,
  and complete P3/P5/P6 input bytes;
- independently timestamped falling edges for logical external-3/CC0;
- independently timestamped UART receive bytes;
- output hooks for P1.5, P1.7, CC2, CC3, A040/A041 writes, fault XRAM, supervisor
  entry `908D`, and cyclic-executive entry `601A`.

The timebase is a harness grid. It does not claim an ECU oscillator, timer
prescaler, tooth count, RPM equation, diagnostic baud rate, or actuator unit.
Frames are full snapshots so a consumer can seek without reconstructing hidden
plant state. Adapter events are deltas sorted by tick, then XDATA, ADC, ports,
CC0, and UART.

## Included scenarios

- `key-on`: changing raw supply-like code, no crank source, one received `06`.
- `cold-crank`: cold-like byte profile and slow edge train.
- `warm-idle`: warm-like bytes and nearly steady edge interval.
- `part-load-ramp`: rising channel values and decreasing edge interval.
- `wide-open-throttle`: high/saturated load-like bytes.
- `overrun`: falling load-like code while edge intervals lengthen.
- `stall`: edge source stops at tick 3600.
- `sensor-ch1-high`, `sensor-ch2-low`, and `sensor-ch0-stuck-high`: selected
  byte-extreme/stuck fixtures.

The names organize profiles; they do not prove firmware operating modes. Zero
and FF fault values are byte extremes, not recovered electrical thresholds.
Uniform crank spacing is not a recovered tooth wheel and may not satisfy the
firmware's synchronization ratio checks.

## Determinism

`create-prng.ts` uses xorshift32 with explicit zero-seed normalization. No wall
clock, locale, filesystem, random API, or floating physical state enters the
pure generator. Each ADC interpolation is quantized immediately to a byte.
The fixture writer uses the generator's stable property and event order.
Re-running a scenario with the same seed produces byte-identical JSON.

The demo plant advances only in 10 ms integer steps. Pedal is slew-limited into
throttle intent, mapped to a 0..127 AFM callback code, and used by the disclosed
combustion proxy alongside starter, drag, brake, and inertia terms. Combustion
is zero when injector schedule feedback is absent. The crank scheduler consumes
live fixed-point RPM one slot at a time, advances omitted positions without
emitting an edge, and emits a low transition followed by a two-cycle return
high; it never prepares a complete trace.

## Observation boundary

Hooks request trace collection; they do not fabricate successful actuator
behavior. P1.5 is the logical Timer-0 ignition command, P1.7 the logical
Timer-1 IAC command, and CC2/CC3 the two logical injector schedules. Connector
pin routing, cylinder/bank identity, coil current, injector flow, valve airflow,
and pulse-duration units remain excluded.

The observer reports count and first/last tick. An absent hook stays an explicit
zero-count result. It does not silently pass a behavior gate. Exact pass/fail
oracles should be added only after canonical runs establish scenario-specific
bounds.

## `accuracy-xdata` integration

`adaptAccuracyXdata()` emits `accuracy-xdata-signal-plan/v1`. Its bootstrap
environment works with the current static `MOTRONIC_INPUTS` parser. The event
stream requires a driver-side scheduler. The included patch intentionally does
only two evidence-preserving prerequisites:

1. exposes a checked `set_input(A000-A0FF, value)` method without coupling
   A040/A041 reads to their output latches;
2. emits cycle-tagged P1 values and changed masks.

A complete runtime consumer must still:

- reject unknown plan versions and non-monotonic ticks;
- convert bench ticks to `attotime` by an exact rational conversion;
- bind dynamic ADC channel callbacks and P3/P5/P6 input callbacks;
- deliver UART bytes through the CPU receive path, not by writing SBUF state;
- deliver external-3/CC0 edges through a core pin/capture API;
- log CC2/CC3 SFR writes and all relevant XDATA reads/writes with cycle tags;
- preserve current strict unknown-read behavior outside configured inputs;
- retain PC entry telemetry for `908D` and `601A`.

The present MCU core explicitly lacks an external-3 pin-edge model. Therefore
the adapter can compile CC0 events, but the current target cannot consume them
causally. Debugger writes to capture registers are not an acceptable substitute.
Likewise, the current target has no time-varying input-plan parser. Apply the
patch as a bridge prerequisite, not as a claim that full scenario integration
already exists.

## Evidence sources

Assumptions cite `ecu/e2e-analysis` subsystem and hardware reports plus the
current `accuracy-xdata` boundary. The strongest recovered facts are raw ADC
channel acquisition, the logical external-3/CC0 capture path, P1/compare output
roles, A040/A041 write roles, fault-record layout, and supervisor/cyclic PCs.
Unresolved physical meanings are recorded in every generated contract.
