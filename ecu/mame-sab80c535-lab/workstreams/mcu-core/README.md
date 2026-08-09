# SAB80C515 MAME MCU workstream

This workstream supplies an evidence-backed first SAB80C515 peripheral model for
the Motronic 1.7 firmware. It applies to MAME commit
`a5cc550d0a2cf7218cbd94c1a0780f7a713f8d8e`. No firmware event is injected and
no firmware check is bypassed.

## Result

- The generated peripheral ROM passes 55 checks at PC `0535`, cycle 469, with
  result `00`.
- Its checks cover reset values, byte and bit access, all requested
  Siemens/Intel address conflicts, Timer 2 overflow/reload and compare,
  software and peripheral interrupt requests, four priority levels, ADC
  completion, capture, P6/DAPR storage, and watchdog start/refresh control.
- It directly reads and writes `IP0` at `a9`; an unmapped `a9` therefore fails
  both the ROM and the log assertion.
- Neither the peripheral test nor either Motronic run reports an unmapped SFR.
- At the baseline-equivalent 50 us bound the patched core follows the same
  reset path as the baseline: `0000 -> 0003 -> 0073 -> 0075 -> 0077 -> 0079 ->
  5c00`. It reaches `5c00` after seven instructions at cycle 11 and stops at
  `5c30`, cycle 49, after 34 executed instructions.
- The first unresolved access remains the external-data write to `a081`
  (`MOVX @DPTR,A` at `5c0c`, reported after the PC advances to `5c0d`, cycle
  18). This is not an MCU SFR.
- In the 4 ms run, 2,514 instructions execute before the last observation at
  `5ce5`, cycle 3,999. Startup reaches the peripheral initialization block:
  `IEN1` at cycle 3,702, `IP0`/`IP1` at 3,716/3,718, `IRCON` at 3,720,
  `T2CON` at 3,726, `CCEN` at 3,730, `ADCON` at 3,732, and the first watchdog
  refresh at 3,747.
- The first control-flow blocker after that initialization is external latch or
  status behavior at XDATA `a040`. The existing RAM backing reads `ff`, so the
  firmware repeats `5ce5..5d08`. Modeling that board device is outside this MCU
  workstream.

The equal-bound run proves removal of the original `a9` diagnostic without
claiming false additional progress in the same time budget. The extended run
proves that the implemented registers can support the later real initialization
sequence.

## SFR conflict resolution

The upstream `sab80c535_device` inherits the Intel 8052 map. The SAB80C515 user
manual and the firmware's direct accesses require Siemens ownership at the
overlapping addresses:

- `a8`: `IEN0`. Base interrupt bits remain, bit 6 is watchdog control, and bit
  7 is global enable.
- `a9`: `IP0`, including read-only watchdog status in bit 6. This replaces the
  prior unmapped address; it is not the Intel 8052 `IP` at `b8`.
- `b8`: `IEN1`, bit-addressable extended enables, replacing inherited Intel
  `IP`.
- `b9`: `IP1`, the high priority bit for each interrupt source.
- `c0`: `IRCON`, bit-addressable extended request flags.
- `c1`: `CCEN`; `c2..c7`: `CC1..CC3` low/high bytes.
- `c8`: Siemens `T2CON`, bit-addressable. The model does not use the inherited
  Intel 8052 Timer 2 interpretation or its UART coupling.
- `ca..cd`: `CRCL`, `CRCH`, `TL2`, and `TH2`; inherited `RCAP2L/H` behavior is
  replaced by Siemens reload/capture and compare behavior.
- `da`: `DAPR`; `db`: digital input `P6`.

The interrupt override implements all 12 vector slots, the Siemens polling
order, `IP0`/`IP1` two-bit priorities, four active nesting levels, and
source-appropriate request clearing. A small base-core change makes IRQ checking
virtual and preserves active priority level 3 when returning from an ISR.

## Implemented peripheral behavior

- Timer 2 uses the Siemens control bits, divide-by-12/divide-by-24 timer
  prescaling, counter/gate inputs, overflow reload from CRC, external reload,
  compare request generation, compare values, and capture-on-CC-write.
- ADC supports the existing analog callback, busy state, 13-cycle conversion,
  `ADDAT`, `IADC`, continuous mode, and DAPR/P6 register behavior.
- Watchdog control supports the `IEN0.WDT` then `IP0.SWDT` start sequence,
  status, the `IEN0.WDT`/`IP0.SWDT` refresh sequence, and hardware-cleared
  control strobes.
- The model saves and restores all added state.

## Deliberately unsupported semantics

- Watchdog timeout counting and watchdog-caused internal reset are not yet
  implemented. Start/status/refresh semantics are modeled.
- Exact Siemens S5P2 pin sampling, compare-output waveforms/shadow transfer,
  capture-pin edges, and external `INT2..INT6` pin polarity are not modeled.
  Software IRCON requests and modeled peripheral requests do work.
- ADC completion currently raises `IADC` when the result is committed. The
  manual's earlier interrupt-request point is not cycle-exact. DAPR is stored
  but does not alter the analog callback's electrical transfer range.
- The one-instruction interrupt-recognition delay after interrupt-control SFR
  writes is not separately modeled.
- P6 is a digital callback input. Analog pin loading and port electrical effects
  are outside the CPU model.
- Motronic external devices at `a040`, `a081`, and the other logged XDATA
  addresses remain unimplemented. Those diagnostics are intentionally retained.

## Reproduction

Create a clean scratch checkout and apply the patch:

```sh
git clone https://github.com/mamedev/mame.git /tmp/mame-motronic-mcu-core
git -C /tmp/mame-motronic-mcu-core checkout a5cc550d0a2cf7218cbd94c1a0780f7a713f8d8e
git -C /tmp/mame-motronic-mcu-core apply \
  /Users/matcha/Code/grokathon/ecu/mame-sab80c535-lab/workstreams/mcu-core/mame-sab80c515.patch
```

Build only the two drivers used by this workstream:

```sh
cd /tmp/mame-motronic-mcu-core
make SUBTARGET=motronic175 \
  SOURCES="src/mame/skeleton/motronic175.cpp,src/mame/skeleton/sab80c515test.cpp" \
  SYMBOLS=0 IGNORE_GIT=1 OSD=sdl USE_LIBSDL=1 \
  OVERRIDE_CC=/usr/bin/clang OVERRIDE_CXX=/usr/bin/clang++ -j4
```

Generate the test ROM in `/tmp` and run the focused test:

```sh
cd /Users/matcha/Code/grokathon/ecu/mame-sab80c535-lab/workstreams/mcu-core
python3 tests/build-test-rom.py
python3 tests/run-peripheral-tests.py \
  --mame /tmp/mame-motronic-mcu-core/motronic175
```

Run the canonical 4 ms trace:

```sh
python3 tests/run-motronic-trace.py \
  --mame /tmp/mame-motronic-mcu-core/motronic175 \
  --rom /Users/matcha/Code/grokathon/ecu/analysis/TotalCombinedROM.bin \
  --label 4ms --debugscript tests/trace-4ms.cmd
```

For the recorded equal-bound run, change the driver probe from
`attotime::from_msec(4)` to `attotime::from_usec(50)`, rebuild with the command
above, and run:

```sh
python3 tests/run-motronic-trace.py \
  --mame /tmp/mame-motronic-mcu-core/motronic175 \
  --rom /Users/matcha/Code/grokathon/ecu/analysis/TotalCombinedROM.bin \
  --label 50us --debugscript tests/trace-50us.cmd
```

The runner verifies the canonical ROM SHA-256
`c1a7a59484f07c6da58397fb7eafa77b511ab435daf515bc506fe9ee5a41bd41`.
The generated peripheral ROM SHA-256 is
`2bb851311dc830552afaa21a5225d60131a420d4e7860d4f21f9c9ac532eaace`.

Validate or regenerate the patch against an unmodified pinned checkout:

```sh
git -C /tmp/mame-sab80c535-src apply --cached --check \
  /Users/matcha/Code/grokathon/ecu/mame-sab80c535-lab/workstreams/mcu-core/mame-sab80c515.patch
python3 tests/export-patch.py \
  --baseline /tmp/mame-sab80c535-src \
  --modified /tmp/mame-motronic-mcu-core
```

## Evidence and artifacts

- `mame-sab80c515.patch`: complete patch against the pinned MAME revision.
- `source/sab80c515test.cpp`: reviewable copy of the focused MAME test driver.
- `tests/build-test-rom.py`: deterministic 8051 test-ROM generator.
- `tests/run-peripheral-tests.py`: peripheral test runner and log assertions.
- `tests/run-motronic-trace.py`: bounded canonical-ROM runner and assertions.
- `tests/trace-*.cmd`: debugger trace scripts.
- `logs/peripheral-tests.log`: passing self-test console output.
- `logs/runtime-{console,trace}-50us.log`: equal-bound evidence.
- `logs/runtime-{console,trace}-4ms.log`: deeper initialization evidence.

Primary hardware evidence is the Siemens SAB80C515/515A User's Manual, SFR and
reset tables, interrupt chapter, Compare/Capture Unit chapter, A/D chapter, and
watchdog chapter. Upstream MAME source establishes the inherited Intel map.
Firmware disassembly is authoritative for the accesses and PCs reported above.
The manual itself is not redistributed.

## Licensing

MAME as a whole is GPL-2.0-or-later. Modified MAME mcs51 CPU files and the new
test driver retain MAME's BSD-3-Clause source headers. Workstream Python scripts
are BSD-3-Clause. Runtime logs contain no MAME binary or ROM image. The
proprietary canonical ROM, generated test ROM, MAME checkout, object files, and
MAME executable are not included.
