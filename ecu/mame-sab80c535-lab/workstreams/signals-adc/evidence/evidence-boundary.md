# ADC evidence boundary

## Firmware-observed access

The combined-ROM disassembly establishes two acquisition paths:

- `CODE:269b` masks `ADCON0` with `f8`, `269e` selects channel zero, and
  `26a1` writes `DAPR` to start conversion. `CODE:2cf3` later reads `ADDAT`
  in the air-mass path.
- `CODE:9e88` starts with `DPTR=be01`, `R0=36`, and four iterations. Each
  iteration calls `9ec2`, stores the result through `@R0`, and increments both
  pointers. This pairs channels 1–4 with `INTMEM:0036–0039`. The separate
  `DPTR=be05` call stores channel 5 at `INTMEM:003a`.
- `CODE:9ec2` masks the selector to three bits, writes `DAPR`, polls
  `ADCON0.BSY`, and returns `ADDAT`. The ADC vector at `CODE:2080` is `RETI`.

The high-ROM function catalog marks the semantic function names as
speculative, but the instruction bytes, register accesses, and channel-to-state
pairing above are direct observations. The subsystem reports independently
classify ADC use and polling behavior as high confidence.

## Logical roles versus connector labels

The recovered producer/consumer graph strongly supports channel 0 as the
air-flow/air-mass input path. Static consumers support medium-confidence state
names for channel 1 (supply-related), channel 2 (intake-temperature-related),
and channel 3 (coolant/engine-temperature-related). The XDF title
`Engine temp sensor transfer map` supports the last interpretation, but an XDF
label is not proof of PCB routing.

Channel 4 is an unknown state with hysteretic behavior. Lambda/oxygen sensing
is a hypothesis only. Channel 5 has no recovered physical role. Channels 6 and
7 are not selected by the normal scan recovered here.

Therefore `channel-map.json` calls accesses proven while marking every physical
connector label inferred or unresolved.

## Electrical and unit boundary

No recovered artifact proves:

- ADC reference voltage or analog front-end divider/gain;
- thermistor resistance curves or voltage-to-temperature equations;
- an AFM voltage-to-air-mass equation;
- channel 4/5 connector routing;
- whether an open circuit reaches the high or low rail;
- exact firmware fault thresholds in physical units.

Fixtures use callback counts and normalized reference ratios only. Values are
deliberately interior for normal profiles. `sensor-open` and `sensor-short`
are explicit rail-injection test assumptions, with polarity configurable by
choosing the corresponding profile; they are not claims about vehicle wiring.

## Profile rationale

Operational names describe the test condition, not recovered engineering
units. Air-mass-path stimulus rises from key-on through crank/load/WOT and
decays on overrun. The supply-related channel sags during crank. Temperature
channels move slowly and remain stable during fast load changes. Channel 4
uses a bounded centered dither at warm idle to exercise hysteretic consumers
without naming it lambda. Channel 5 and unobserved channels remain at neutral
interior values.

The higher cold-profile counts chosen for channels 2 and 3 are an engineered
NTC-front-end hypothesis. The binary does not prove that polarity; tests that
must avoid it can override the provider data in a future fixture revision.

Sources: `ecu/e2e-analysis/subsystems/03-sensor-acquisition.md`,
`04-engine-load-and-modes.md`, `09-adaptation-faults-fallbacks.md`,
`hardware-model.*`, `runtime-state.json`, `program-model.json`,
`calibration-index.json`, and `function-catalog.json`.
