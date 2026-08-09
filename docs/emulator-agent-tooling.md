# Emulator agent tooling

This guide explains how an agent can control, inspect, and debug a Game Boy ROM
through SameBoy without automating the emulator GUI.

The recommended entry point is the Python `SameBoy` class in
`agent/sameboy.py`. It provides deterministic frame and instruction execution,
joypad input, screenshots, memory and register access, breakpoints, watchpoints,
save states, and SameBoy debugger commands.

## Quick start

From the repository root:

```bash
git submodule update --init
brew install cppp rgbds
make
make smoke
```

`make` produces:

- `bin/libgrokboy.dylib` on macOS;
- `bin/libgrokboy.so` on Linux; and
- SameBoy's DMG and CGB boot ROMs under `vendor/SameBoy/build/`.

The smoke tests exercise that control surface with Breakout and also prove
that the CGB-only, MBC5 Postie benchmark leaves its boot ROM, executes banked
cartridge code, and exposes both VRAM banks and palettes.

## Which interface should an agent use?

Use the Python API when the agent can execute Python. This is the simplest and
most reliable interface:

```python
from agent.sameboy import SameBoy

with SameBoy("raw_rom/breakout.gb") as gameboy:
    gameboy.run(frames=120)
    gameboy.press("left", frames=10)
    print(gameboy.registers())
```

Use the JSON-lines CLI when the agent framework works with subprocesses or
generic command tools:

```bash
python3 agent/sameboy.py raw_rom/breakout.gb
```

Then send one JSON object per line on stdin. Keep this process alive for the
whole debugging session because emulator state is held in memory.

Use `SameBoyPair` after a reconstruction builds. It owns two isolated emulator
instances, aligns them after their boot ROMs unmap, drives the same input/frame
timeline, and compares visible and machine state:

```python
from agent.compareboy import SameBoyPair

with SameBoyPair(
    "workspaces/run/rom/program.gb",
    "workspaces/run/src/reconstructed.gb",
    artifacts="workspaces/run/artifacts/compare",
) as pair:
    pair.boot()
    pair.run(60)
    pair.checkpoint("title")
    pair.press("start", frames=10)
    pair.run(120)
    pair.checkpoint("gameplay")
    pair.write_report("workspaces/run/artifacts/compare/report.json")
```

Checkpoints compare native RGB, both VRAM banks, CGB palettes, direct OAM, and
optional semantic memory mappings. Each produces separate lossless original,
candidate, and difference PNGs plus a left-to-right overview triptych. Use the
overview for quick visual review and the separate images/JSON as exact evidence.
Use several checkpoints around inputs and transitions; video is useful for a
human overview, but temporal alignment and encoding make it a poor exact oracle.

The JSON CLI form accepts reusable timelines:

```bash
python3 agent/compareboy.py \
  --original path/to/original.gb \
  --candidate path/to/reconstructed.gb \
  --script agent/compare_scripts/postie-first-room.json \
  --artifacts artifacts/compare \
  --output artifacts/compare/report.json
```

Use `harness/grokboy.h` only when integrating another language directly. It is
the low-level C ABI, not the recommended agent interface.

## Architecture

The tooling has two layers:

1. `harness/grokboy.c` links to `libsameboy`. It owns the emulator instance,
   callbacks, tight instruction loop, breakpoints, watchpoints, memory,
   registers, and framebuffer copying.
2. `agent/sameboy.py` loads that bridge with `ctypes`. It owns validation, JSON,
   paths, PNG encoding, traces, exceptions, and ergonomic methods.

Keeping the execution loop native avoids one Python FFI call per emulated CPU
instruction. Keeping parsing and file handling in Python avoids implementing
those error-prone operations in C.

Each `SameBoy` object is an isolated emulator instance. An agent can open two
instances at once to compare an original ROM with a reconstruction.

## Recommended agent lifecycle

Create one emulator instance, perform all investigation through it, and close
it with a context manager:

```python
with SameBoy("raw_rom/breakout.gb", trace="debug-session.jsonl") as gameboy:
    # Observe.
    gameboy.run(frames=120)
    gameboy.screenshot("/tmp/initial.png")

    # Stop before code of interest.
    gameboy.add_breakpoint(0x065D)
    stopped = gameboy.run(frames=300)

    # Inspect.
    state = gameboy.read(0xC0A0, 6)
    disassembly = gameboy.debug("disassemble/10 $065D")

    # Exercise behavior.
    gameboy.clear_breakpoints()
    gameboy.press("right", frames=15)
```

Do not create a new `SameBoy` instance for each action. That would reboot the
ROM and discard the state the agent is trying to investigate.

## Python API

### Lifecycle and status

```python
gameboy = SameBoy(
    "path/to/game.gb",
    trace="trace.jsonl", # Optional replayable command trace.
)

status = gameboy.status()
gameboy.reset()
gameboy.reset(quick=True)
gameboy.reload()
gameboy.close()
```

`reload()` reloads the ROM from disk. Use it after rebuilding or patching the
ROM. `reset()` resets the current loaded ROM.

### Execution

```python
result = gameboy.run(frames=60)
result = gameboy.run(
    frames=600,
    until_pc=0x065D,
    max_instructions=50_000_000,
)
result = gameboy.step()
```

`run()` executes until one of these occurs:

- the requested frame count completes;
- a harness breakpoint is reached;
- a watchpoint is triggered;
- `until_pc` is reached; or
- `max_instructions` is exhausted.

The instruction cap prevents an agent from hanging indefinitely on a broken
ROM or an unreachable address.

### Joypad input

Valid buttons are `right`, `left`, `up`, `down`, `a`, `b`, `select`, and
`start`.

```python
gameboy.press("a", frames=1)

gameboy.key("right", True)
gameboy.run(frames=30)
gameboy.key("right", False)
```

`press()` always releases the button after the run, including when execution
stops early or raises an exception. Use `key()` when multiple buttons must be
held together.

### Memory

```python
data = gameboy.read(0xC0A0, 6)
gameboy.write(0xC0A0, bytes.fromhex("4c"))
```

Addresses are 16-bit. Each transfer is limited to 4096 bytes. Harness-initiated
reads and writes do not trigger watchpoints; only emulated CPU accesses do.

### Registers

```python
registers = gameboy.registers()
registers = gameboy.set_register("pc", 0x065D)
```

Available names are:

- 16-bit: `af`, `bc`, `de`, `hl`, `sp`, `pc`
- 8-bit: `a`, `f`, `b`, `c`, `d`, `e`, `h`, `l`

Register writes are powerful and can create impossible machine states. Prefer
breakpoints and save states unless direct mutation is part of the experiment.

### Breakpoints

```python
gameboy.add_breakpoint(0x065D)
stopped = gameboy.run(frames=300)
gameboy.delete_breakpoint(0x065D)
gameboy.clear_breakpoints()
```

Harness breakpoints stop before the instruction at that address executes. When
resuming, the harness skips the current breakpoint once so execution can make
progress. It can stop there again on the next visit.

Use harness breakpoints for deterministic agent control. A breakpoint installed
through a raw SameBoy debugger command does not block waiting for the next JSON
request.

### Watchpoints

```python
gameboy.add_watchpoint(0xC0A5, access="write")
gameboy.add_watchpoint(0xC000, end=0xC0FF, access="rw")
stopped = gameboy.run(frames=600)
gameboy.clear_watchpoints()
```

Access can be `read`, `write`, or `rw`. A watchpoint stops immediately after the
CPU instruction that caused the access. The result reports the address and
value.

### SameBoy expression evaluator and debugger

```python
pc = gameboy.evaluate("pc")
byte = gameboy.evaluate("[$C0A5]")

print(gameboy.debug("disassemble/10 $065D"))
print(gameboy.debug("registers"))
print(gameboy.debug("backtrace"))
print(gameboy.debug("examine/16 $C0A0"))
print(gameboy.debug("lcd"))
```

Useful SameBoy debugger commands include:

- `disassemble/count address`
- `registers`
- `backtrace`
- `print expression`
- `examine/count address`
- `lcd`
- `apu`
- `palettes`
- `dma`
- `cartridge`

Use `evaluate()` when a numeric result is easier for the agent to consume. Use
`debug()` when formatted debugger output is useful evidence.

### Screenshots

```python
path = gameboy.screenshot("/tmp/frame.png")
```

Run at least one frame before taking a screenshot. The screenshot is encoded as
PNG in Python from SameBoy's 160×144 RGB framebuffer.

### Save states

```python
gameboy.save_state("/tmp/before.state")
gameboy.press("left", frames=30)
gameboy.load_state("/tmp/before.state")
```

Save states make experiments reproducible. A strong debugging pattern is:

1. reach the state before a bug;
2. save it;
3. try an input or memory change;
4. collect evidence; and
5. restore before trying the next hypothesis.

Save states are tied to the SameBoy version, hardware model, and ROM. Do not
load a state created for a different ROM build.

### Symbols

```python
gameboy.load_symbols("build/game.sym")
print(gameboy.debug("disassemble/10 MainLoop"))
```

SameBoy accepts RGBDS symbol files. Symbols make breakpoint expressions and
debugger output substantially easier for an agent to understand.

## Stop results

`run()`, `press()`, and `step()` return a dictionary containing:

```json
{
  "ok": true,
  "stopped": "breakpoint",
  "stop_address": 1629,
  "stop_value": 0,
  "executed": 2481,
  "frames": 90,
  "instructions": 684221,
  "registers": {
    "af": 160,
    "bc": 0,
    "de": 0,
    "hl": 49317,
    "sp": 65530,
    "pc": 1629,
    "a": 0,
    "f": 160,
    "b": 0,
    "c": 0,
    "d": 0,
    "e": 0,
    "h": 192,
    "l": 165
  }
}
```

Possible `stopped` values:

- `frame-limit`: requested frames completed normally;
- `breakpoint`: a harness breakpoint was reached;
- `watch-read`: an emulated read matched a watchpoint;
- `watch-write`: an emulated write matched a watchpoint;
- `until-pc`: the temporary `until_pc` target was reached; and
- `instruction-limit`: the safety cap was exhausted.

An agent should always inspect `stopped` instead of assuming the requested frame
count completed.

## JSON-lines interface

Start a persistent process:

```bash
python3 agent/sameboy.py raw_rom/breakout.gb --trace session.jsonl
```

The following request forms are supported.

### Observe and execute

```json
{"cmd":"status"}
{"cmd":"registers"}
{"cmd":"run","frames":60}
{"cmd":"run","frames":600,"until_pc":"$065D","max_instructions":50000000}
{"cmd":"step"}
```

### Input

```json
{"cmd":"press","button":"left","frames":10}
{"cmd":"key","button":"a","pressed":true}
{"cmd":"key","button":"a","pressed":false}
```

### Memory and registers

```json
{"cmd":"read","address":"$C0A0","length":6}
{"cmd":"write","address":"$C0A0","hex":"4c"}
{"cmd":"set-register","name":"pc","value":"$065D"}
```

Addresses and numeric values may be JSON integers, `$`-prefixed hexadecimal
strings, or `0x`-prefixed strings.

### Breakpoints and watchpoints

```json
{"cmd":"breakpoint","action":"add","address":"$065D"}
{"cmd":"breakpoint","action":"delete","address":"$065D"}
{"cmd":"breakpoint","action":"list"}
{"cmd":"breakpoint","action":"clear"}

{"cmd":"watchpoint","action":"add","address":"$C0A5","access":"write"}
{"cmd":"watchpoint","action":"add","start":"$C000","end":"$C0FF","access":"rw"}
{"cmd":"watchpoint","action":"delete","start":"$C000","end":"$C0FF"}
{"cmd":"watchpoint","action":"list"}
{"cmd":"watchpoint","action":"clear"}
```

### Debugger and artifacts

```json
{"cmd":"eval","expression":"[$C0A5]"}
{"cmd":"debug","command":"disassemble/10 $065D"}
{"cmd":"screenshot","path":"/tmp/frame.png"}
{"cmd":"save-state","path":"/tmp/before.state"}
{"cmd":"load-state","path":"/tmp/before.state"}
{"cmd":"load-symbols","path":"/tmp/game.sym"}
{"cmd":"reset","quick":false}
{"cmd":"reload"}
{"cmd":"quit"}
```

The CLI prints one JSON response for each request. Validation failures are
returned as `{"ok": false, "error": "..."}` and do not terminate the emulator
process.

## Traces and replay

Pass `trace=` to the Python class or `--trace` to the CLI:

```python
with SameBoy("game.gb", trace="session.jsonl") as gameboy:
    gameboy.run(frames=60)
    gameboy.press("start")
```

The trace contains the exact JSON requests in order and ends with `quit` after
a normal context-manager close.

Replay requests into a fresh emulator:

```python
import json
from agent.sameboy import SameBoy

requests = [
    json.loads(line)
    for line in open("session.jsonl")
    if line.strip()
]

with SameBoy("game.gb") as gameboy:
    responses = gameboy.replay(requests)
```

Paths embedded in screenshot, state, or symbol commands must still exist and
may need rewriting before replay on another machine.

## Debugging recipes

### Find where a value changes

```python
with SameBoy("game.gb") as gameboy:
    gameboy.run(frames=120)
    gameboy.add_watchpoint(0xC0A5, access="write")
    hit = gameboy.run(frames=3600)
    print(hit["registers"])
    print(gameboy.debug("disassemble/10 pc"))
    print(gameboy.debug("backtrace"))
```

### Reproduce an input-dependent bug

```python
with SameBoy("game.gb") as gameboy:
    gameboy.run(frames=120)
    gameboy.save_state("/tmp/repro.state")

    gameboy.press("left", frames=12)
    first = gameboy.read(0xC000, 256)

    gameboy.load_state("/tmp/repro.state")
    gameboy.press("right", frames=12)
    second = gameboy.read(0xC000, 256)

    changed = [index for index, pair in enumerate(zip(first, second)) if pair[0] != pair[1]]
    print(changed)
```

### Compare original and reconstructed ROMs

```python
from agent.sameboy import SameBoy

with (
    SameBoy("raw_rom/breakout.gb") as original,
    SameBoy("pipeline/gbdk-reconstruction/breakout/breakout-reconstructed.gb") as rebuilt,
):
    for button, frames in [("left", 10), ("right", 20), ("left", 5)]:
        original.press(button, frames)
        rebuilt.press(button, frames)

        assert original.read(0xC0A0, 6) == rebuilt.read(0xC0A0, 6)
```

For meaningful differential tests, both ROMs need an agreed mapping from their
internal addresses to the same semantic state.

### Bounded repair loop

An automated repair agent should:

1. build the ROM;
2. launch one `SameBoy` instance;
3. replay a minimal input trace;
4. stop on a breakpoint, watchpoint, or failed invariant;
5. collect registers, relevant memory, disassembly, and a screenshot;
6. close the emulator;
7. patch and rebuild;
8. launch a fresh instance and replay the same trace; and
9. stop after a fixed number of repair attempts.

Do not reuse an emulator after rebuilding the ROM unless `reload()` succeeds
and no old save state or symbol file is being reused accidentally.

## Exposing this as agent tools

An agent framework should keep one `SameBoy` object in session state and expose
thin tools that call it:

```python
class EmulatorTools:
    def __init__(self, rom: str):
        self.gameboy = SameBoy(rom, trace="agent-session.jsonl")

    def run(self, frames: int, until_pc: int | None = None):
        return self.gameboy.run(frames, until_pc=until_pc)

    def press(self, button: str, frames: int = 1):
        return self.gameboy.press(button, frames)

    def read_memory(self, address: int, length: int = 1):
        return {"hex": self.gameboy.read(address, length).hex()}

    def screenshot(self, path: str):
        return {"path": str(self.gameboy.screenshot(path))}
```

Recommended tool set:

- `emulator_status`
- `emulator_run`
- `emulator_step`
- `emulator_press`
- `emulator_set_key`
- `emulator_read_memory`
- `emulator_write_memory`
- `emulator_get_registers`
- `emulator_set_register`
- `emulator_add_breakpoint`
- `emulator_add_watchpoint`
- `emulator_debug`
- `emulator_screenshot`
- `emulator_save_state`
- `emulator_load_state`
- `emulator_execution_coverage`
- `emulator_asset_runs`
- `emulator_video_state`
- `emulator_reset`
- `emulator_reload`
- `emulator_close`

Keep the tools narrow and return structured dictionaries. Avoid a single tool
that accepts arbitrary Python code.

## Suggested instructions for an emulator agent

The following can be included in an agent system prompt:

> Keep one emulator session alive while investigating. Observe before mutating.
> Use harness breakpoints and watchpoints for deterministic stops. Check the
> `stopped` reason after every run. Save state before invasive experiments.
> Prefer memory reads, register reads, disassembly, and screenshots as evidence.
> Use bounded frame and instruction counts. Record a trace for every reproduction.
> After rebuilding the ROM, use a fresh emulator or explicitly reload it. Never
> claim a bug is fixed until the original trace passes again.

## Current limitations

- The bridge automatically selects DMG-B or CGB-E from the cartridge header.
  SGB and explicit model selection are not exposed through the Python API.
- There is no graphical emulator window; observation is through screenshots and
  state inspection.
- Audio capture is not exposed.
- Raw SameBoy debugger breakpoints do not provide an asynchronous paused RPC
  session. Use harness breakpoints and watchpoints instead.
- The Python process loads native code in-process. A native crash terminates the
  controlling process, although normal inputs are validated before crossing the
  C boundary.
- Save states are not portable across arbitrary SameBoy versions or ROM builds.

## Relevant files

- `agent/sameboy.py`: recommended Python and JSON interfaces
- `agent/breakout_smoke.py`: complete executable example
- `agent/postie_smoke.py`: CGB/MBC5, bank coverage, and video-memory example
- `harness/grokboy.h`: exported C ABI
- `harness/grokboy.c`: native SameBoy bridge
- `Makefile`: native build and smoke-test targets
- `breakout-reverse-engineering.md`: Breakout-specific addresses and findings
- `pipeline/gbdk-reconstruction/breakout/differential_test.py`: differential-testing example
