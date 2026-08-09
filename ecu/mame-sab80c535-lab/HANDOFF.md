# Motronic M1.7 MAME handoff

## Goal

Turn the canonical Bosch Motronic M1.7 firmware into an interactive bench:
applying accelerator input should increase modeled airflow/torque, increase
crank RPM, feed the new crank timing and sensor values back into the real ROM,
and expose injector, ignition, idle-control, limiter, fault, and diagnostic
behavior.

Repository: `/Users/matcha/Code/grokathon`.

## Canonical inputs

- Firmware: `ecu/analysis/TotalCombinedROM.bin`
- Size: 40,960 bytes (`0xA000`)
- SHA-256:
  `e262e6aa26ddf6c7c8aa02f636d422709e0a08945739b84886204d1693e33`
- MAME revision:
  `a5cc550d0a2cf7218cbd94c1a0780f7a713f8d8e`
- CPU family: Siemens SAB80C515; MAME base device is `sab80c535_device`.
- Firmware/static behavioral evidence: `ecu/e2e-analysis/`.
- Cleanroom behavioral implementation: `cleanroom/`.

## Current executable

`/tmp/mame-motronic-mcu-core/motronic175` is the current integrated reduced
MAME target. It contains three systems:

- `motronic175`: canonical ROM plus signal providers.
- `sab515test`: MCU peripheral conformance ROM.
- `sab515cap`: external CC0 capture conformance ROM.

Rebuild incrementally:

```sh
cd /Users/matcha/Code/grokathon/ecu/mame-sab80c535-lab/workstreams/accuracy-xdata
PATH="/opt/homebrew/opt/node/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin" \
MAME_DIR=/tmp/mame-motronic-mcu-core JOBS=4 /bin/bash build.sh
```

The integrated incremental build takes about 6.5 seconds. The initial reduced
build took 3m52s. Do not start parallel cold MAME builds. The `/tmp` source is a
prepatched non-Git tree; `build.sh` handles both it and a clean pinned Git
checkout.

## Integrated architecture

Primary workstream:
`ecu/mame-sab80c535-lab/workstreams/accuracy-xdata/`.

Important files:

- `src/motronic175.cpp`: maps/configuration and composed P3 ownership.
- `src/motronic175-state.h`: driver state contract.
- `src/motronic175-runtime.cpp`: limits, crank scheduling, PC/interrupt/output
  telemetry.
- `src/motronic175-adc-bindings.cpp`: eight MAME analog callbacks.
- `src/motronic175-crank-trace.h`: strict cycle/level trace loader.
- `src/motronic175-xdata*.{cpp,h}`: XRAM, board inputs, output latches, taint,
  unknown-read policy, and board-signal provider.
- `build.sh`: applies core/callback/CC0 patches, installs all provider sources,
  and builds one reduced target.
- `verify-combined.py`: baseline MCU/XDATA deterministic gate.
- `README.md`: current commands, evidence boundaries, and results.

Provider workstreams:

- `signals-board-io/`: A040/A041 and P3/P5/P6 provider, seven scenarios.
- `signals-adc/`: eight deterministic 7-bit ADC profiles and fault injection.
- `signals-crank/`: configurable crank geometry, seven scenarios, CC0 core
  patch, generated capture oracle.
- `signals-kw71/`: nine RXD/K-line fixtures and P3.0/P3.1 adapter.
- `signals-engine-plant/`: versioned TypeScript scenario contract, ten
  synchronized offline plans, output observer hooks. There is no MAME timed
  plan loader yet.

All provider pure tests passed. Every authored source remains below 250 lines.

## Verified runtime facts

Baseline:

```sh
cd ecu/mame-sab80c535-lab/workstreams/accuracy-xdata
python3 verify-combined.py \
  --mame /tmp/mame-motronic-mcu-core/motronic175 \
  --rom ../../../analysis/TotalCombinedROM.bin
```

Passes MCU conformance and deterministic combined execution. The 800 ms
no-crank run reaches startup frontier `5D0D`, enters supervisor `908D`, executes
494,680 instructions, services Timer 1 158 times and Timer 2 six times, but
does not enter cyclic executive `601A`.

CC0 capture:

```sh
cd ecu/mame-sab80c535-lab/workstreams/signals-crank
python3 tests/run-capture-test.py \
  --mame /tmp/mame-motronic-mcu-core/motronic175 \
  --run-dir /tmp/sab515cap-run
```

Passes falling-edge selection, capture-before-vector ordering, automatic IEX3
clearing, and the exact 121-cycle two-edge delta.

Integrated synthetic idle:

```sh
python3 tools/generate-trace.py idle --output /tmp/motronic-idle.csv
python3 tests/run-motronic-stimulus.py \
  --mame /tmp/mame-motronic-mcu-core/motronic175 \
  --rom ../../../analysis/TotalCombinedROM.bin \
  --trace /tmp/motronic-idle.csv \
  --run-dir /tmp/motronic-realistic-idle-run \
  --log /tmp/motronic-realistic-idle.log \
  --board-scenario idle --adc-profile warm-idle
```

Passes deterministic replay. Both runs apply all 89 transitions, enter capture
vector `0053` 27 times, enter `601A` nine times, produce zero unknown XDATA
reads, then restart at cycle 333,326. This proves causal signal transport and
foreground execution, not stable physical crank synchronization.

KW71:

- P3.0 RXD waveform transitions from `valid-session-start.stim` are delivered.
- P3.1 TXD transition at time zero is observed.
- A complete UART session, baud/mode behavior, serial vector, and decoded ECU
  response remain unproven.

## Recovered hardware/software boundary

- Crank/timing input is P1.0 / INT3 / CC0.
- Firmware initializes falling-edge capture (`T2CON=85`, `CCEN=01`).
- Capture latches CRCL/CRCH, raises `IRCON.IEX3`, vectors at `0053`, then
  dispatches through `20A0` to acquisition `2462` or synchronized worker
  `21D8`.
- Timer-2 overflow vector `002B -> 2070` extends timestamps with byte `003F`.
- CC2/P1.2 and CC3/P1.3 are logical injector scheduling outputs.
- Timer0/P1.5 is the logical ignition output.
- Timer1/P1.7 is the logical IAC PWM/watchdog path.
- ADC channel 0 is the high-confidence airflow/air-mass path.
- Channels 1, 2, and 3 are supply-, intake-temperature-, and
  coolant-temperature-related with medium confidence.
- ADC channels 4 and 5 remain unresolved.
- MAME ADC callback range is 0..127; the core commits `callback * 2` to ADDAT.
- A040/A041 reads are independent board input/status bytes. Writes are output
  latches and must never be read back as inputs.
- Board provider owns P3 bits generally; KW71 overrides P3.0 RXD and observes
  P3.1 TXD.

## Evidence boundaries and traps

- Production crank wheel geometry, missing positions, events/revolution,
  oscillator, connector routing, and physical polarity before the MCU are not
  proven. The checked-in crank fixture is synthetic 12-position/one-gap.
- Cleanroom defaults to 60 uniform events/revolution; that is an assumption,
  not a recovered 60-2 waveform. Its “missing tooth” test only pauses captures.
- `cleanroom/web/app/engine-plant.ts` has useful control-flow structure but its
  torque, drag, inertia, and RPM constants are invented.
- Cleanroom incorrectly models ignition on compare channels; canonical evidence
  puts ignition on Timer0/P1.5.
- Exact CC2/CC3 compare pin waveforms are not implemented in MAME yet.
- Current crank core captures before same-cycle Timer-2 increment. Exact
  edge/overflow phase requires hardware evidence.
- The current synthetic idle reaches foreground but then reset recovery.
  Do not suppress the restart or write firmware sync/RPM state directly.
- `signals-engine-plant` produces NDJSON plans, but MAME cannot consume them
  dynamically yet.
- Keep strict unknown-read and output-latch alias gates. Never make A040/A041
  reads return the last write.
- The repository has extensive untracked work. Do not clean/reset or commit
  unrelated files. Do not commit unless explicitly asked.
- Node is at `/opt/homebrew/opt/node/bin/node`; include that directory in PATH.

## Next architecture for accelerator-to-RPM

Implement a closed loop at peripheral boundaries:

1. Add a runtime stimulus controller that accepts pedal position while MAME is
   running. Do not precompute the complete crank CSV.
2. Convert pedal to throttle intent, then to airflow/AFM channel 0 through a
   documented demo plant. Accelerator does not directly set RPM or firmware
   RAM.
3. Maintain plant RPM from starter torque, estimated combustion torque, drag,
   inertia, and limiter/fuel-cut feedback. Keep every constant tagged as an
   assumption.
4. Generate the next CC0 edge interval from current plant RPM and configurable
   wheel geometry; schedule edges through `SAB80C515_CC0_LINE`.
5. Feed time-varying ADC and A040/A041/P3/P5/P6 values through existing
   callbacks/providers.
6. Observe injector CC2/CC3 and ignition P1.5 timing. Add missing compare-output
   telemetry before using injector pulse width as a torque oracle.
7. Expose a process control API (Unix socket, stdin protocol, or MAME Lua) for
   pedal/starter/load commands and telemetry. Prefer a deterministic ticked
   protocol that can be replayed headlessly.
8. Reuse the cleanroom web bench UI only as a front end; keep MAME and the real
   ROM authoritative.
9. Define two modes: `demo` permits disclosed plant assumptions; `evidence`
   refuses unproven wheel/transfer settings.
10. Preserve gates: MCU conformance, CC0 oracle, baseline, deterministic
    replay, no firmware-state writes, no unknown soft-pass, and no output/input
    aliasing.

The immediate design decision is the control bridge. A Unix-domain socket with
fixed-tick JSON/NDJSON commands is the clearest headless/testable option; MAME
Lua may be faster to prototype but is less clean for a reusable web UI.
