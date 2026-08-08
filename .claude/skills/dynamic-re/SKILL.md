---
name: dynamic-re
description: Drive and inspect the target program in a headless SameBoy emulator — deterministic execution, input, memory, breakpoints, watchpoints, save states, screenshots — to verify static-analysis hypotheses with runtime evidence.
---

# Dynamic analysis with the SameBoy bridge

You can execute the target program in a headless emulator and observe it while
it runs. Use this to *verify* hypotheses formed from static analysis: set
watchpoints on RAM addresses you believe you understand, replay inputs, and
confirm the real program behaves the way your reconstruction predicts.

`TASK.md` gives the concrete paths for this workspace: the `sameboy.py`
control module and the target ROM. There is no emulator window — observation
is screenshots and state inspection.

## Quick start

```python
import sys
sys.path.insert(0, "<agent-dir>")   # directory containing sameboy.py, see TASK.md
from sameboy import SameBoy

with SameBoy("<rom-path>") as gb:   # ROM path from TASK.md
    gb.run(frames=120)
    gb.press("left", frames=10)
    print(gb.registers())
    gb.screenshot("frame.png")      # 480x432 PNG, readable by vision
```

Write each experiment as a small Python script and run it from the shell. A
script boots the ROM fresh, so make experiments reproducible from cold:
deterministic input sequences, and save states for expensive-to-reach points.
Keep one `SameBoy` instance per script; a new instance reboots the ROM.

## Execution

```python
result = gb.run(frames=600, until_pc=0x065D, max_instructions=50_000_000)
result = gb.step()
```

`run()` stops on: frame count done, a breakpoint, a watchpoint, `until_pc`
reached, or the instruction cap. **Always check `result["stopped"]`** — one of
`frame-limit`, `breakpoint`, `watch-read`, `watch-write`, `until-pc`,
`instruction-limit`. The result also carries `stop_address`, `stop_value`,
counts, and a full register dump.

## Input

Buttons: `right`, `left`, `up`, `down`, `a`, `b`, `select`, `start`.

```python
gb.press("a", frames=10)        # hold for the run, auto-release
gb.key("right", True)           # manual hold, for chords
gb.run(frames=30)
gb.key("right", False)
```

## Memory, registers

```python
data = gb.read(0xC0A0, 6)               # bytes; max 4096 per call
gb.write(0xC0A0, bytes([0x4C]))
regs = gb.registers()                    # af/bc/de/hl/sp/pc + 8-bit halves
gb.set_register("pc", 0x065D)            # powerful; prefer breakpoints
```

Harness reads/writes do not trigger watchpoints; only emulated CPU accesses do.

## Breakpoints and watchpoints

```python
gb.add_breakpoint(0x065D)                # stops before the instruction
stopped = gb.run(frames=300)
gb.clear_breakpoints()

gb.add_watchpoint(0xC0A5, access="write")            # read | write | rw
gb.add_watchpoint(0xC000, end=0xC0FF, access="rw")   # ranges supported
hit = gb.run(frames=3600)                # stops after the accessing instruction
gb.clear_watchpoints()
```

On resume from a breakpoint the harness skips it once so execution progresses;
it can hit again on the next visit.

## Debugger and expressions

```python
pc = gb.evaluate("pc")
byte = gb.evaluate("[$C0A5]")
print(gb.debug("disassemble/10 $065D"))
print(gb.debug("backtrace"))
print(gb.debug("examine/16 $C0A0"))
```

Other useful debugger commands: `registers`, `print`, `lcd`, `apu`,
`palettes`, `dma`, `cartridge`. Use `evaluate()` for numbers, `debug()` when
formatted output is useful evidence.

## Recovering bank-switched code (important for ROMs > 32 KB)

Static analysis can see the fixed bank (`ROM0`) but usually finds **no
functions** in the switchable banks (`ROM1`, `ROM2`, …): a banked `call $4c00`
targets whichever bank a runtime register selected, so Ghidra can't tell which
bank — and leaves that code as raw bytes. On a multi-bank game that is most of
the program (graphics, levels, enemies, audio, real gameplay logic).

The emulator resolves this: it knows the live bank at every instruction. Turn
on the call-target trace, **play through as much of the game as you can** (more
coverage = more banked functions found), then hand the seeds to staticre's
`create_functions`, which disassembles each and lets intra-bank flow-following
define the rest.

```python
gb.call_trace(True)
gb.run(frames=240); gb.press("start", frames=60); gb.run(frames=600)
# ...drive real gameplay: move, jump, enter doors, trigger enemies...
seeds = gb.call_targets()   # e.g. [{"canonical": "ROM5:4c00", "bank": 5, ...}, ...]
```

Then, via the staticre tools:

```
create_functions([s["canonical"] for s in seeds])   # ROM1..ROMn become real functions
```

Do this early: the banked functions it exposes are what you then annotate,
decompile, and reconstruct. The more of the game you exercise before dumping
seeds, the more of it becomes analyzable. Re-run the trace after reaching new
areas to pick up newly executed banks.

## Recovering graphics (asset trace)

The call trace recovers *code*; the *data* (tiles, background maps) is copied
into VRAM at runtime and won't be found that way. To embed the real graphics
instead of placeholders, trace the copies: while the game draws a screen, the
asset trace attributes every VRAM write to the ROM byte it came from and
coalesces straight copy loops into `(bank, src, dst, length)` runs.

```python
gb.asset_trace(True)
gb.run(frames=240)          # let the title / a stage draw itself
runs = gb.asset_runs()      # [{"canonical": "ROM6:5a00", "dst": 0x8000, "length": 4096}, ...]
```

Two cases, distinguished by a run's length:

- **Uncompressed copy** (a run whose length covers a whole VRAM tile/map
  region): the ROM bytes ARE the asset. Extract them statically and embed:
  `extract_data([{"address": r["canonical"], "length": r["length"], "name": "tiles_title"}])`
  returns a GBDK C array; write it into `src/` and load it instead of a
  placeholder.
- **Decompressed copy** (a short source span feeding a long dest region): the
  ROM source is compressed and not directly usable. Snapshot the *result* from
  VRAM instead — `gb.read(0x8000, length)` gives the decompressed tiles — and
  embed those bytes.

Only assets that are actually drawn during your play-through are captured, so
exercise the screens you want to reproduce. Provenance (which ROM bank/address
an asset came from) is worth recording in `NOTES.md`.

## Screenshots

```python
gb.screenshot("frame.png")               # 3x nearest-neighbor, 480x432
gb.screenshot("frame.png", scale=1)      # native 160x144
```

Run at least one frame first. View screenshots to check what the game is
actually showing — they are sized for vision models.

## Save states

```python
gb.save_state("before.state")
gb.press("left", frames=30)
gb.load_state("before.state")            # exact rewind
```

The core experiment pattern: reach an interesting state, save, try an input or
memory mutation, collect evidence, restore, try the next hypothesis. States are
tied to this ROM and emulator build — do not reuse them across rebuilds.

## Traces

```python
with SameBoy("<rom>", trace="session.jsonl") as gb:
    ...
```

The trace records every request in order; `gb.replay(requests)` re-runs one
into a fresh instance. Record a trace for any reproduction you cite as
evidence.

## Recipes

Find what writes a variable:

```python
gb.run(frames=120)
gb.add_watchpoint(0xC0A5, access="write")
hit = gb.run(frames=3600)
print(hit["registers"]["pc"], gb.debug("disassemble/10 pc"), gb.debug("backtrace"))
```

Check your reconstruction against reality: drive the original ROM with a fixed
input sequence, log the RAM addresses from your recovered memory map each
frame, and check that your C logic predicts the same state transitions.
Disagreements are either a bug in your reconstruction or a wrong hypothesis —
investigate both ways, and record the outcome in `NOTES.md` with the trace as
evidence. Only the original program runs in the emulator; never load your own
build into it.

## Discipline

- Observe before mutating; prefer reads, disassembly, and screenshots as
  evidence over register/memory pokes.
- Check `stopped` after every run; never assume the frame count completed.
- Use bounded frame and instruction counts — a broken hypothesis must not hang
  your session.
- Save state before invasive experiments; restore before the next one.
- A hypothesis is confirmed only when the runtime evidence matches the static
  evidence. Record confidence changes in your annotations and `NOTES.md`.
