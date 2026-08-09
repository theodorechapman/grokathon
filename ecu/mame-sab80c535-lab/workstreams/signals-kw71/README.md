# Motronic 1.7 KW71/K-line stimuli

This workstream supplies deterministic tester-to-ECU serial fixtures and a
minimal MAME line adapter for the combined `accuracy-xdata` emulator. Nothing
here writes `SBUF`, internal RAM, XRAM protocol cells, or the program counter.
The adapter changes P3.0/RXD over emulated time and lets the SAB80C515 UART,
`RI`, and serial interrupt path consume the waveform.

No MAME build or canonical runtime was performed in this workstream. The
included tests are pure Python source, parser, and oracle tests.

## What is supported

- No tester: RXD remains high.
- Session start: tester `06`, then `7E` as the complement of ECU keyword `81`.
- Five-block automatic identifier transfer using response service `F6` and
  tester continuation service `09`.
- One bounded data/SFR read: service `01`, count one, SFR space `01`, P1 at
  address `90`; expected response service is `FE`.
- Actuator-test service `04` with recovered request code `03`.
- Bad complement, receive timeout, low stop bit, and service `06` disconnect.

`EVIDENCE.md` is authoritative for facts, assumptions, service bytes, raw
identifier payloads, and unresolved behavior. In particular, the protocol has
no recovered additive checksum field. `malformed-checksum.stim` is a corrupted
per-byte complement test.

## Files

- `fixtures/*.stim`: timestamped RX byte/line records.
- `fixtures/scenarios.json`: scenario and supported-service contract.
- `tools/stimulus-format.py`: strict parser and 8N1 line expansion.
- `tools/kw71-fixtures.py`: deterministic fixture builder.
- `tools/stimulus-oracle.py`: timing/framing oracle.
- `tools/manifest-gate.py`: evidence-bound semantic gate.
- `mame/motronic175-kw71.{h,cpp}`: MAME RXD adapter.
- `patches/motronic175-kw71.patch`: combined-driver integration patch.
- `tests/`: snapshots, parser/oracle tests, negative gates, and source gates.

## Stimulus format

The first record declares bit time. Remaining records are strictly increasing:

```text
bit-us 104
byte 20000 06 good
byte 24000 7e good
line  30000 1
```

`byte` values are hexadecimal and expand to start, eight LSB-first data bits,
and a high `good` or low `bad` stop bit. A bad stop is released high after one
bit period. Times are microseconds from machine reset. Comments start with `#`.

The nominal `104 us` 8N1 and `4 ms` tester slots are replaceable KW71-family
assumptions. Exact baud initialization, wake timing, and electrical polarity
are not binary-proven.

Regenerate and run all pure tests:

```bash
cd ecu/mame-sab80c535-lab/workstreams/signals-kw71
python3 tools/generate-fixtures.py
./run-tests.sh
```

## Later single-build integration

Start with the already prepared, pinned MAME source used by `accuracy-xdata`.
Install that workstream's `src/*` first, then from this directory:

```bash
install -m 0644 mame/motronic175-kw71.* \
  "$MAME_DIR/src/mame/skeleton/"
git -C "$MAME_DIR" apply --check \
  "$PWD/patches/motronic175-kw71.patch"
git -C "$MAME_DIR" apply "$PWD/patches/motronic175-kw71.patch"
```

Add `src/mame/skeleton/motronic175-kw71.cpp` to the existing reduced target's
`SOURCES` list. The resulting list must include:

```text
src/mame/skeleton/motronic175.cpp
src/mame/skeleton/motronic175-xdata.cpp
src/mame/skeleton/motronic175-xdata-config.cpp
src/mame/skeleton/motronic175-kw71.cpp
src/mame/skeleton/sab80c515test.cpp
```

Run one fixture with a long enough deterministic bound:

```bash
MOTRONIC_KW71_STIMULUS="$PWD/fixtures/read-memory-sfr.stim" \
MOTRONIC_CONTINUE_FOREGROUND=1 \
MOTRONIC_TIMEOUT_MS=1000 \
MOTRONIC_INSTRUCTION_LIMIT=10000000 \
"$MAME_DIR/motronic175" motronic175 -window -nothrottle
```

The patch preserves the existing stop-at-first-foreground behavior unless
`MOTRONIC_CONTINUE_FOREGROUND` is present. Missing
`MOTRONIC_KW71_STIMULUS` means no tester and RXD high.

## Required runtime gates

The later MAME run must establish all of the following before calling a
scenario successful:

1. P3.0 transitions are sampled by the SAB core at the configured baud.
2. A good byte sets `SBUF`/`RI`, enters vector `0023`, and reaches `8960`.
3. `SCON=90/68/FA/E8` transitions produce the receive/transmit modes expected
   by this firmware on the patched SAB80C515 core.
4. ECU TXD edges decode to `55`, `00`, `81`, then identifier `F6` blocks.
5. Every ECU block byte is accepted only after the tester complement.
6. The bounded SFR request reaches command `01` and emits response `FE`.
7. Actuator service `04`, payload `03`, reaches `8BAC` and later `8000`
   without assigning an unproven physical actuator name.
8. Wrong complement reaches rollback/recovery; a stalled body reaches timeout.
9. A low stop bit has an observed, documented core result. Acceptance as `06`
   must fail the framing-error gate unless the core is fixed or the lack of a
   framing-error flag is explicitly retained as hardware behavior.
10. Service `06` releases the session and returns TXD/RXD to idle without a
    debugger or harness write to firmware memory.

Also repeat each run and compare normalized RX/TX/vector/service events. Equal
fixtures must produce byte-identical event streams after removing host paths.

## Remaining uncertainties

- Actual oscillator and UART baud generator configuration.
- Five-baud wake/address behavior and keyword timing before `06`.
- K-line transceiver inversion, echo, voltage, slew, and collision behavior.
- Whether MAME's inherited 8051 UART correctly models all SAB80C515 modes.
- Timeout units, retry windows, and exact real-tool inter-byte timing.
- Names for request services not used here and meanings of identifiers 2-4.
- Physical actuator mapping for codes `03,20,1D,24,25,30`.
