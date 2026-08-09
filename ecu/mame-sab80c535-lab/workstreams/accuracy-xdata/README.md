# Combined Motronic MCU and signal emulator

## Result

This workstream combines the validated SAB80C515 core, XDATA model, board-I/O
provider, ADC profiles, CC0 crank capture, and KW71 line adapter in one reduced
`motronic175` target. The executable also contains the `sab515test` and
`sab515cap` conformance drivers.

The combined verification passes:

- SAB80C515 reset, SFR, bit access, Timer 2, ADC, watchdog-control, priority,
  and interrupt tests.
- The external CC0 oracle proves falling-edge selection, capture-before-vector
  ordering, IEX3 clearing, and an exact 121-cycle two-edge delta.
- Strict XDATA execution stops at the first unsupported input read:
  `A040` from `CODE:5CEA`.
- A controlled zero-valued input approximation takes
  `5CEA -> 5CEF -> 5D0A`, reaches startup frontier `5D0D`, completes the ROM
  checksum path, and enters the supervisor at `908D`.
- The 800 ms deterministic run executes 494,680 instructions with one startup,
  one supervisor entry, 158 Timer-1 entries, six Timer-2 entries, and no
  Timer-2 interrupt storm.
- P1 changes 157 times and ends at `7F`; the callback records transitions
  without producing per-edge log spam.
- A synthetic idle run applies all 89 scheduled pin transitions, enters vector
  `0053` 27 times, reaches `601A` nine times, and repeats byte-for-byte.
- With the `idle` board profile and `warm-idle` ADC profile, the same run has
  zero unknown XDATA reads. It restarts after 333,326 cycles; the bundled
  synthetic 12-position/one-gap geometry is therefore transport evidence, not
  a validated production wheel.

The result crosses the original MCU/XDATA blockers and causally executes the
capture ISR and cyclic foreground. It does not yet prove stable engine sync.

## Evidence boundary

The providers are evidence-bounded transport models, not electrical models:

- XRAM `0000-03FF` starts at zero.
- Board scenarios control `A040/A041` and P3/P5/P6 without aliasing output
  latches back into reads.
- ADC profiles supply 7-bit callbacks; exact voltage and temperature transfer
  curves remain unknown.
- Crank geometry, oscillator rate, and RPM scale are configurable. The bundled
  geometry makes no vehicle claim.
- KW71 fixtures drive P3.0/RXD and observe P3.1/TXD. Line delivery is verified,
  but UART mode/baud and a successful canonical session remain runtime gates.
- P0 and P2/P4/P5 output callbacks remain unmodeled; P1 transitions are logged.

Writes to `A040/A041` remain independent from reads at those addresses. The
strict run proves where unsupported input semantics first affect execution.
The no-crank approximation does not reach `601A`; the synthetic crank run does,
then enters reset recovery. Stable synchronization requires geometry and timing
corroborated for the physical ECU.

## Opt-in lockstep bridge

Set `MOTRONIC_BRIDGE_SOCKET` to a Unix-domain socket path to activate protocol
`motronic-bridge/v1`. MAME hosts the socket using its existing `domain.`
`osd_file` implementation. `MOTRONIC_BRIDGE_TIMEOUT_MS` sets the hard wall-time
read/write deadline and defaults to 5000 ms.

Bridge commands and responses are one strict JSON object per line. Unknown
fields and versions are fatal. The first command must be `hello`; no CPU
execution occurs before the first accepted `advance`.

```json
{"schema":"motronic-bridge/v1","type":"hello"}
{"schema":"motronic-bridge/v1","type":"advance","seq":0,"fromCycle":0,"toCycle":1000,"events":[{"cycle":0,"kind":"xdata","address":41024,"value":1},{"cycle":0,"kind":"adc","channel":0,"value":127},{"cycle":0,"kind":"port","port":3,"value":254},{"cycle":100,"kind":"cc0","state":1},{"cycle":102,"kind":"cc0","state":0}]}
{"schema":"motronic-bridge/v1","type":"shutdown"}
```

`advance` ranges are contiguous and half-open: `fromCycle <= event.cycle <
toCycle`. Sequence numbers start at zero. A batch is limited to 4096 ordered
events and 12,000,000 cycles. Event contracts are:

- `xdata`: address `A000-A0FF`, value `0-255`;
- `adc`: channel `0-7`, callback code `0-127` (the MCU commits code times two
  to ADDAT);
- `port`: P3, P5, or P6 and value `0-255`; KW71 still owns P3.0;
- `cc0`: explicit external CC0 line state zero or one.

Each completed batch returns a `frame` at exactly `toCycle`. Its structured
telemetry contains A040/A041 output-latch writes, CCEN and C4-C7 SFR writes,
and bit-specific P1.2/P1.3/P1.5/P1.7 transitions. Counters include Timer0,
Timer1, Timer2, capture, `0063`, and `006B` vector entries. CC2/CC3 entries are
schedule-register evidence only; exact compare pin waveforms are not modeled.
A040/A041 bridge inputs remain separate from output latches.

Bridge mode rejects simultaneous `MOTRONIC_CRANK_TRACE` input. With no bridge
socket variable, all existing env/CSV paths and log formats are unchanged.

Run the focused bridge gates after an incremental build:

```sh
PATH="/opt/homebrew/opt/node/bin:$PATH" \
MAME_DIR=/tmp/mame-motronic-mcu-core \
bash tests/run-bridge-protocol-tests.sh
python3 tests/run-bridge-integration.py \
  --mame /tmp/mame-motronic-mcu-core/motronic175 \
  --rom ../../../analysis/TotalCombinedROM.bin
```

## Fast reproduction

Use the already-built source tree for an incremental rebuild:

```sh
MAME_DIR=/tmp/mame-motronic-mcu-core JOBS=4 ./build.sh
python3 verify-combined.py \
  --mame /tmp/mame-motronic-mcu-core/motronic175 \
  --rom ../../../analysis/TotalCombinedROM.bin
```

The verified incremental build takes about six seconds on the current
machine. `build.sh` also accepts a clean Git checkout at MAME commit
`a5cc550d0a2cf7218cbd94c1a0780f7a713f8d8e`; it applies the MCU, instruction
callback, and CC0 patches before installing the signal sources.

Generate and run the synthetic idle stimulus:

```sh
python3 ../signals-crank/tools/generate-trace.py idle \
  --output /tmp/motronic-idle.csv
python3 ../signals-crank/tests/run-motronic-stimulus.py \
  --mame /tmp/mame-motronic-mcu-core/motronic175 \
  --rom ../../../analysis/TotalCombinedROM.bin \
  --trace /tmp/motronic-idle.csv \
  --run-dir /tmp/motronic-realistic-idle-run \
  --log /tmp/motronic-realistic-idle.log \
  --board-scenario idle --adc-profile warm-idle
```

## Artifacts

- `src/motronic175.cpp`, `motronic175-state.h`, and
  `motronic175-runtime.cpp`: composed driver and bounded telemetry.
- `src/motronic175-adc-bindings.cpp`: eight ADC callbacks.
- `src/motronic175-crank-trace.h`: strict cycle/level trace loader.
- `src/motronic175-xdata*.{cpp,h}`: storage, external input, output-latch,
  board-signal, taint, and configuration model.
- Sibling `signals-*` workstreams contain providers, fixtures, patches, tests,
  provenance, and the synchronized offline scenario contract.
- `verify-combined.py`: focused MCU and combined-runtime verification.
- `runtime-combined-strict.log`: strict first-unknown boundary.
- `runtime-combined-approx-zero*.log`: repeated deterministic supervisor runs.
- `address-inventory.json`: static, access-specific XDATA evidence.
