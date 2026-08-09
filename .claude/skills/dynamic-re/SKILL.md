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
    # Do not mistake a long CGB boot animation for cartridge execution.
    for _ in range(10):
        gb.run(frames=60)
        if gb.read(0xFF50)[0] & 1:
            break
    assert gb.read(0xFF50)[0] & 1, "boot ROM never unmapped"
    gb.press("left", frames=10)
    print(gb.registers())
    gb.screenshot("frame.png")      # 480x432 PNG, readable by vision
```

Write each experiment as a small Python script and run it from the shell. A
script boots the ROM fresh, so make experiments reproducible from cold:
deterministic input sequences, and save states for expensive-to-reach points.
Keep one `SameBoy` instance per script; a new instance reboots the ROM.

Start by calling `gb.status()`. Its `hardware` and `cartridge` objects identify
DMG versus CGB mode, the currently mapped ROM/RAM/VRAM banks, cartridge type,
and declared bank counts. The CGB boot animation can take several hundred
frames. FF50 bit 0 is the authoritative boundary: screenshots, traces, and
input before it becomes 1 describe the boot ROM, not the target cartridge.

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

For complete evidence rather than function-entry seeds, use the physical
execution trace. It losslessly compresses distinct `(ROM bank, PC)` addresses
into per-bank ranges and separately records the switchable-bank timeline:

```python
gb.execution_trace(True)
# ...boot fully and exercise title, menus, and gameplay...
gb.execution_trace(False)
coverage = gb.execution_coverage()
print(coverage["count"], coverage["banks"], coverage["bank_events"])
```

Use call targets as `create_functions` seeds; use full coverage to see which
physical banks and code regions actually ran, to prioritize disassembly, and
to measure whether a new input sequence reached anything new.

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
coalesces straight copy loops into
`(bank, src, vram_bank, dst, length)` runs.

```python
gb.asset_trace(True)
gb.run(frames=240)          # let the title / a stage draw itself
runs = gb.asset_runs()      # includes physical source ROM and destination VRAM banks
```

Two cases, distinguished by a run's length:

- **Uncompressed copy** (a run whose length covers a whole VRAM tile/map
  region): the ROM bytes ARE the asset. Extract them statically and embed:
  `extract_data([{"address": r["canonical"], "length": r["length"], "name": "tiles_title"}])`
  returns a GBDK C array; write it into `src/` and load it instead of a
  placeholder.
- **Decompressed copy** (a short source span feeding a long dest region): the
  ROM source is compressed and not directly usable. Snapshot the *result* from
  VRAM instead. On CGB, do not use a CPU-window read alone because it sees only
  the currently selected VRAM bank. `gb.video_state("artifacts/video")` dumps
  `vram0.bin`, `vram1.bin`, `bgp.bin`, and `obp.bin`, with SHA-256 provenance
  in its return value. Embed the relevant bytes.

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

## Comparing the reconstruction (second emulator)

Once `src/reconstructed.gb` builds, run it in a separate SameBoy instance and
drive both ROMs with the same cartridge-relative timeline. `SameBoyPair` is a
differential debugger and evidence-gathering instrument, not a grader. It boots
each ROM independently past `FF50`, then compares lossless native RGB, VRAM,
CGB palettes, direct OAM, and selected CPU state:

```python
import sys
sys.path.insert(0, "/opt/pipeline/agent")
from compareboy import SameBoyPair

with SameBoyPair(
    "rom/program-....gb",
    "src/reconstructed.gb",
    artifacts="artifacts/compare",
) as pair:
    print(pair.boot())
    print(pair.trace("title-idle", 60))
    pair.press("start", frames=10)
    pair.save_pair("room-start")
    print(pair.trace(
        "room-idle", 118,
        probes=[{
            "name": "player-x",
            "original_address": 0xc4ec,
            "candidate_address": 0xc100,
            "type": "u8",
        }],
    ))
    pair.load_pair("room-start")
    print(pair.trace("room-right", 118, buttons=["right"]))
    pair.write_report("artifacts/compare/report.json")
```

`trace()` observes every frame by default and stops on the first requested
channel divergence, preserving the exact frame and localized evidence. Named
semantic probes decode corresponding state even when the two ROMs use
different addresses. `save_pair()` / `load_pair()` make alternate input and
timing experiments start from precisely corresponding states.

Each recorded checkpoint writes separate lossless `.original.png`, `.candidate.png`, and
amplified `.diff.png` files, plus one `.overview.png` triptych ordered
original/candidate/difference from left to right. The separate files remain the
exact visual evidence; the overview saves vision-tool calls. A single moment
can conceal timing and behavior errors. Prefer per-frame traces around dynamic
behavior and sparse checkpoints for stable screens. Video is useful as a human
overview, but exact PNG frames plus machine state are more useful for
attribution: video encoding and temporal alignment obscure the first causal
mismatch.

For a reusable timeline, run the CLI with a JSON script. See
`/opt/pipeline/agent/compare_scripts/postie-first-room.json` for the format:

```sh
python /opt/pipeline/agent/compareboy.py \
  --original rom/program-....gb \
  --candidate src/reconstructed.gb \
  --script experiments/compare.json \
  --artifacts artifacts/compare \
  --output artifacts/compare/report.json
```

Map semantic state explicitly: `original_address` comes from reverse
engineering, while `candidate_address` comes from the reconstruction's map or
symbol file. The `address` shorthand is only appropriate when both layouts are
intentionally identical. A candidate mismatch falsifies the reconstruction; a
candidate match does not prove untested behavior. Probe types include `u8`,
`s8`, `u16le`, `s16le`, and `hex`; optional `mask` and `shift` expose packed
state. Actively branch from save states with different idle lengths, tap/hold
durations, chords, boundaries, failures, and restarts. Record exact matches,
divergences, causal explanations, and untested scope in `RECONSTRUCTION.md`.

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

Check your reconstruction against reality with `SameBoyPair`: drive the
original and candidate with a fixed input sequence and compare the RAM
addresses from your recovered memory map at multiple frames. Disagreements are
either a bug in the reconstruction or a wrong hypothesis—investigate both ways
and record the outcome in `NOTES.md` with the comparison report as evidence.

## Discipline

- Observe before mutating; prefer reads, disassembly, and screenshots as
  evidence over register/memory pokes.
- Check `stopped` after every run; never assume the frame count completed.
- Use bounded frame and instruction counts — a broken hypothesis must not hang
  your session.
- Save state before invasive experiments; restore before the next one.
- A hypothesis is confirmed only when the runtime evidence matches the static
  evidence. Record confidence changes in your annotations and `NOTES.md`.
