---
name: static-re
description: How to reverse-engineer the target binary using the staticre MCP tools (Ghidra-backed static analysis). Use whenever analyzing the loaded program, naming functions/data, or building hypotheses about what code does.
---

# Static reverse engineering with the staticre MCP

You are analyzing an unknown binary through the `staticre` MCP server. You do
not know what the program is; your job is to work that out from evidence and
record findings as annotations. Do not assume the program's identity — infer
behavior from code and state your reasoning as evidence.

## Ground rules

- **Addresses are always `SPACE:hex` strings** (`ROM:0150`, `WRAM:c120`,
  `IO:ff40`). Get valid spaces from `memory_map`. Never use bare integers.
- **Disassembly is authoritative; decompilation is one observation.** The
  decompiler struggles with some SM83 instructions. When decompiler output
  looks wrong or vague, check the disassembly before concluding anything.
- **Name provenance matters.** Every name has a `name_source`:
  `loader` (trustworthy, from the platform definition — e.g. hardware
  register names like `LCDC`, `JOYP`), `ghidra_analysis`/`ghidra_generated`
  (heuristic placeholder like `FUN_1732`), `agent` (your own prior
  inference — re-check before building on it).
- **The first tool call is slow** (~15-60s: JVM start + analysis). Later
  calls are fast. Don't retry a slow first call.

## Workflow

1. **Orient**: `program_info` → `memory_map` → `entry_points`.
2. **Scan**: `list_functions` (paginate). Note big functions and ones with
   many callers (likely helpers) or many callees (likely init/main).
3. **Follow the entry**: `disassemble` from the entry point; follow the jump.
   If the target isn't a function yet, `create_function` there first.
4. **Examine one function at a time**: `get_function` first — its
   `referenced_memory` reads/writes plus loader-named IO registers are the
   fastest hypothesis generator (e.g. reads `JOYP` → input handling; writes
   `OAM`/DMA regs → sprite drawing; writes `NR5x` → audio). Then
   `decompile`, and `disassemble` for anything the decompiler mangles.
5. **Trace data**: when a RAM address looks important, `xrefs` on it to find
   every reader/writer, then examine those functions. This is the main way
   to identify game-state variables.
6. **Record as you go**: `annotate` each identified function
   (`kind="function"`) and variable (`kind="data"`) with a name, a one-line
   comment, tags, a confidence in [0,1], and **evidence** — short factual
   statements ("reads JOYP, masks bit 1, adds ±1 to WRAM:c120"). Never
   annotate without evidence. Use lowercase_snake_case names
   (`update_paddle`, `ball_y`); leave things you're unsure about unnamed
   rather than guessing.
7. **Fill gaps**: auto-analysis misses code reached only by jumps or
   computed calls. If `xrefs` or disassembly reveals code that isn't in
   `list_functions`, use `create_function`.

## Platform notes (SM83 / this memory map)

- `IO:ff00`–`IO:ff7f` are hardware registers, already symbol-named by the
  loader (`JOYP/P1`, `LCDC`, `STAT`, `SCY/SCX`, `LY`, `BGP`, `NR1x-NR5x`,
  `DIV`, `TIMA`, `IF`). `IE:ffff` is the interrupt-enable register.
- Interrupt vectors: `ROM:0040` VBlank, `0048` LCD STAT, `0050` timer,
  `0058` serial, `0060` joypad. Code at these addresses runs per-interrupt —
  a per-frame game loop usually syncs with VBlank.
- `WRAM` (`c000-dfff`) holds game state; `HRAM` (`ff80-fffe`) holds
  hot/DMA-safe code and variables; `OAM` (`fe00-fe9f`) is sprite attributes,
  usually written via DMA (`IO:ff46`) from a WRAM shadow buffer — find that
  shadow buffer to find sprite state.
- Graphics live in `VRAM` as 2bpp tiles; text is often custom tile indices,
  so `list_strings` returning nothing does not mean there is no text.

## Goal shape

The end state is a program where behavior-critical reachable functions have
evidence-backed names and important RAM addresses are named data—enough to
implement and test the behavior currently in scope. Do not spend the run
annotating uncertain functions merely to maximize annotation count. Uncertain
hypotheses about RAM addresses remain valuable: annotate them with low
confidence and evidence so they can be tested against a live run.
