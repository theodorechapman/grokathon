# Motronic 1.7 ADC stimuli

Deterministic, evidence-bounded analog stimuli for the SAB80C515 MAME core.
The provider emits the core's existing 7-bit callback unit; the validated core
commits `callback * 2` to `ADDAT`.

## Supported firmware channels

- Channel 0: proven acquisition, high-confidence logical air-mass path.
- Channel 1 -> `INTMEM:0036`: supply-related role, medium confidence.
- Channel 2 -> `INTMEM:0037`: intake-temperature-related role, medium confidence.
- Channel 3 -> `INTMEM:0038`: coolant/engine-temperature-related role, medium confidence.
- Channel 4 -> `INTMEM:0039`: unknown hysteretic state; lambda is unproven.
- Channel 5 -> `INTMEM:003a`: role unresolved.
- Channels 6–7: no recovered normal scan; provider holds them at midpoint.

Channel access is firmer than connector naming. No physical transfer curve,
reference voltage, exact temperature, exact air mass, or fault threshold is
claimed. See `evidence/evidence-boundary.md` and `evidence/channel-map.json`.

## Profiles and configuration

`fixtures/profiles.json` defines key-on, cold-crank, warm-idle, part-load, WOT,
overrun, sensor-open, and sensor-short checkpoints. The native provider linearly
interpolates between checkpoints using emulated microseconds. Warm idle loops;
other profiles hold their final value.

After integration, select a profile with:

```sh
MOTRONIC_ADC_PROFILE=warm-idle /path/to/motronic175 motronic175 ...
```

Fault profiles default to channel 3. Select any firmware-observed channel:

```sh
MOTRONIC_ADC_PROFILE=sensor-open \
MOTRONIC_ADC_FAULT_CHANNEL=2 \
/path/to/motronic175 motronic175 ...
```

`sensor-open` injects high rail and `sensor-short` low rail after 100 ms. Those
polarities are test assumptions, not recovered ECU electrical behavior. Swap
profiles when testing the opposite polarity.

## Pure verification

No MAME tree or build is needed:

```sh
./run-tests.sh
```

The suite checks fixture schema and negative gates, compiles the provider with
strict warnings, verifies every C++ checkpoint against JSON, checks looping and
interpolation, exercises configurable fault targeting, and validates
ratio/voltage-to-callback-to-`ADDAT` quantization. Caller-supplied voltage
conversion requires an explicit reference; the workstream supplies no guessed
ECU voltage.

## Deferred integration

The patch is intentionally not applied by this workstream:

```sh
git apply --check \
  ecu/mame-sab80c535-lab/workstreams/signals-adc/patches/accuracy-xdata-adc.patch
git apply \
  ecu/mame-sab80c535-lab/workstreams/signals-adc/patches/accuracy-xdata-adc.patch
```

It updates `accuracy-xdata/build.sh` to install and compile
`src/motronic175-adc.*`, then wires all eight MAME analog callbacks into the
combined driver. This is ready for a later single incremental build. Per task
constraints, this workstream does not clone, patch, or build MAME.

## Artifact map

- `src/motronic175-adc.*`: dependency-free, time-varying native provider.
- `fixtures/profiles.json`: machine-readable profile checkpoints.
- `python/signals_adc/quantization.py`: explicit unit conversion.
- `tests/`: native parity, behavior, quantization, and negative gates.
- `patches/accuracy-xdata-adc.patch`: deferred integration patch.
- `evidence/`: channel recovery, confidence, and uncertainty boundary.
