# MAME SAB80C535 firmware lab

## Outcome

Current upstream MAME is a useful instruction-core base, but not a complete
SAB80C515 emulator. The reduced `motronic175` target builds and executes the
canonical firmware. Its debugger trace verifies this reset path:

`0000 -> 0073 -> 0075 -> 0077 -> 0079 -> 007b -> 20e0 -> 5c00`

PC `5c00` is reached after seven executed instructions, at MAME machine cycle
11. The 50 microsecond probe records 31 PC observations and stops
deterministically. `runtime-trace.log` is runtime evidence, not static
disassembly.

The first core blocker is already visible in reset handling: the Siemens `IP0`
SFR at `a9` is unmapped. The first unknown external-device access is the
`MOVX` write of `01` to XDATA `a081` at PC `5c0c`. The driver deliberately
does not invent behavior for either. Only the previously proven storage
latches at XDATA `a040-a041` have RAM backing.

The configured 12 MHz crystal is a lab assumption; the ECU oscillator remains
unknown. The instruction order and machine-cycle count do not depend on that
assumed wall-clock rate.

## Reproduce

macOS prerequisites are Git, Python 3, Xcode Command Line Tools, GNU Make, and
Homebrew SDL2 (`sdl2-config`). MAME source and build products remain in `/tmp`.

```bash
cd /Users/matcha/Code/grokathon/ecu/mame-sab80c535-lab
bash build-mame.sh
bash run-proof.sh
python3 test-smoke.py
```

`build-mame.sh` clones the exact upstream revision, applies
`motronic175.patch`, and uses MAME's `SOURCES=` reduced-target build. It selects
the installed SDL2 OSD and Apple Clang explicitly. Override scratch location or
parallelism with `MAME_DIR=/tmp/other-mame` and `JOBS=2`.

`run-proof.sh` symlinks, rather than copies, the source ROM into a temporary ROM
directory. It starts the scripted MAME debugger, traces each instruction with
the machine-cycle count, and lets the driver's 50 microsecond timer stop the
run. The smoke test fails on an absent trace, wrong ROM, wrong ordered PCs,
wrong cycle/instruction count, or missing blocker evidence.

## Upstream and licensing

- Repository: `https://github.com/mamedev/mame.git`
- Commit: `a5cc550d0a2cf7218cbd94c1a0780f7a713f8d8e`
- Commit date: `2026-08-08T20:51:44-04:00`
- MAME as a whole: GPL-2.0+
- `sab80c535`, `i8051`, and `i8052` device files: BSD-3-Clause
- This driver patch: BSD-3-Clause

## Source-observed feature support

- CPU and CODE: generic MCS-51 instruction execution, debugger state, MOVC,
  MOVX, and 12-clock machine cycles are implemented. `SAB80C535` is ROM-less;
  this driver maps the 0xa000-byte image directly at CODE `0000-9fff`.
- IDATA: 256 bytes are implemented because the device inherits `i8052_device`
  with the eight-bit internal RAM address mask.
- Base SFRs: generic 8052 accumulator, B, PSW, stack, DPTR, PCON, Timer 0/1,
  UART, interrupt, and P0-P3 registers are mapped.
- Siemens SFRs: only ADCon `d8`, ADDat `d9`, P4 `e8`, and P5 `f8` are added.
  `IP0 a9`, `IP1 b9`, `IRCON c0`, `CCEN c1`, compare/capture `c2-c7`, `DAPR
  da`, and P6 `db` are absent. Inherited `b8` is generic `IP`, conflicting
  with the Siemens `IEN1` location.
- Interrupts: only the six generic 8052 sources and vectors through `002b` are
  implemented. Siemens extended enables, requests, priorities, ADC interrupt,
  compare/capture interrupts, and watchdog interrupt behavior are missing.
- Timer 0/1: generic 8051 modes and overflow flags are implemented, with
  upstream TODOs around exact gate/input behavior.
- Timer 2 and compare/capture: inherited Intel 8052 auto-reload/capture/baud
  semantics are implemented at `c8/ca-cd`; these are not the Siemens
  T2CON/compare semantics. CCEN and all three compare/capture channels are
  absent.
- ADC: channel selection and an immediate callback-derived ADDat value exist.
  Conversion timing, busy/completion behavior, DAPR, P6 analog selection, and
  ADC interrupt behavior are not implemented.
- Watchdog: absent. `WDT` and `SWDT` exist only as disassembler names for
  currently unmapped Siemens interrupt/SFR bits.
- Ports: generic quasi-bidirectional P0-P3 plus simple P4/P5 latches and
  callbacks exist. P6 is absent; alternate pin functions are incomplete.
- UART: generic MCS-51 modes and bit-stream callbacks exist. Upstream marks
  mode-0 receive as unemulated and mode-0 transmit timing as simplified.

These are source-code observations, not claims that unexercised peripherals
work in this firmware.

## Runtime facts and limits

- ROM: 40,960 bytes; SHA-256
  `e262e6aa26ddf6c7c8aa02f636d422709309e0a08945739b84886204d1693e33`.
- Verified trace: 31 PC observations through machine cycle 48.
- Reset PC `0000` is captured from the stopped debugger before execution.
- PC `5c00` is the eighth observed instruction boundary, after seven
  instructions and at machine cycle 11.
- Runtime reports unmapped SFR `a9` immediately after the instruction at
  `0073`.
- Runtime reports the first unknown XDATA write at `a081` immediately after
  the `MOVX` at `5c0c`.
- Writes to the backed `a040-a041` latches execute without an unmapped access.
- Bosch ASIC registers, general XRAM, real ADC inputs, crank signals,
  actuators, serial wiring, watchdog reset, and extended interrupts remain
  unimplemented.

MAME is therefore viable for CPU/reset progression and as a framework to extend,
but full ECU emulation requires a real SAB80C515 peripheral implementation and
an evidence-based Bosch ASIC/XDATA model.

## Artifacts

- `motronic175.cpp`: standalone reduced driver source.
- `motronic175.patch`: applyable MAME driver plus `mame.lst` registration.
- `build-mame.sh`: pinned clone, patch, and reduced build.
- `trace-reset.cmd`, `run-proof.sh`: bounded runtime trace.
- `test-smoke.py`: ROM and runtime proof gate.
- `runtime-trace.log`, `runtime-console.log`: captured evidence from the final
  successful run.
