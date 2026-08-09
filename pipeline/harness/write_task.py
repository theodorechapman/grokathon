"""Write the per-run TASK.md: the concrete prompt the RE agent executes."""

from __future__ import annotations

from pathlib import Path

STATIC_TASK = """# Task: reverse-engineer an unknown binary and reimplement it in raw C

You are analyzing an unknown program, `{program_id}`, through the `staticre`
MCP tools (Ghidra-backed static analysis of an SM83 / Game Boy binary). You do
NOT know what the program is — infer everything from evidence.

Read `static_re.md` in this workspace first; it documents the tools and the
workflow. Then:

1. Map the program: entry point, memory regions, functions.
2. Keep a running `NOTES.md` summarizing the recovered memory map, behavioral
   evidence, confidence, and open questions. Annotate behavior-critical
   functions and data as evidence supports them; annotation count is not a
   completion target.
"""

DYNAMIC_TASK = """3. Discovery gate. Execute the original program in a headless emulator and
   observe it while it runs — read `dynamic_re.md` in this workspace for the
   full API and discipline. Control it from Python:

   ```python
   import sys; sys.path.insert(0, "{agent_dir}")
   from sameboy import SameBoy
   gb = SameBoy("{rom_path}")
   ```

   Inspect `gb.status()` first. The target may be CGB-only and its boot
   animation can last several hundred frames. Do not treat screenshots or
   traces as target evidence until `gb.read(0xFF50)[0] & 1` proves the boot ROM
   has unmapped. Run in bounded 60-frame chunks until that happens.

   Drive the original with deterministic input sequences, inspect screenshots,
   and watchpoint RAM addresses in your recovered memory map. Before writing C,
   record at least one reproducible title/gameplay timeline and its relevant
   frame, video, OAM, and memory checkpoints.

4. Recover banked code before reconstruction. If `memory_map` contains ROM1,
   ROM2, or later banks and static analysis found few functions in them, turn
   on the emulator's call-target and execution traces, exercise the program,
   collect seeds, and pass them to `create_functions`. If an indirect far-call
   trampoline defeats the generic CALL tracer, breakpoint it and record its
   logical bank/address arguments. Read the "Recovering bank-switched code"
   section of `dynamic_re.md`.

   Collect physical execution coverage with `execution_trace()` and
   `execution_coverage()`. Use it to identify every ROM bank and code region
   actually reached, and use the bank-event timeline to design input sequences
   that expand coverage. Call targets remain the correct function seeds.

5. Implement the behavior supported by your evidence in raw C under `src/`,
   targeting the Game Boy with GBDK-2020 (`lcc` is at `/opt/gbdk/bin/lcc`).
   `src/Makefile` must build a real `src/reconstructed.gb`. Keep game logic
   separable from hardware access and cite source addresses in comments.

   Recover the real graphics for exercised screens. Use asset tracing for
   direct copies and `video_state()` for post-decompression CGB state. Preserve
   both VRAM banks and both CGB palette memories where applicable.

6. Candidate comparison gate. You MUST run the compiled reconstruction in a
   second, independent emulator and compare it with the original on the same
   input timeline. Use the comparison interface documented in `dynamic_re.md`:

   ```python
   import sys; sys.path.insert(0, "{agent_dir}")
   from compareboy import SameBoyPair

   with SameBoyPair(
       "{rom_path}",
       "src/reconstructed.gb",
       artifacts="artifacts/compare",
   ) as pair:
       pair.boot()
       pair.run(60)
       pair.checkpoint("title")
       pair.press("start", frames=10)
       pair.run(118)
       pair.checkpoint("gameplay")
       pair.write_report("artifacts/compare/report.json")
   ```

   Add semantic memory mappings where useful; original and candidate variables
   may live at different addresses. Rebuild, replay, inspect the
   original/candidate/difference PNGs and structured
   state deltas, and repair the C. The candidate is never evidence about what
   the original does; it is how you falsify your reconstruction.

7. Completion is evidence-based. A clean build or matching static screen is not
   enough. Do not call the reconstruction faithful or complete unless the
   comparison report supports that claim across the exercised behaviors.
   Report the first divergent checkpoint, exact scope tested, and all untested
   or known-divergent behavior in `NOTES.md`.
"""

STATIC_IMPLEMENT_TASK = """3. Reimplement the evidence-supported program in raw C under `src/`,
targeting the Game Boy with GBDK-2020. `src/Makefile` must build a real
`src/reconstructed.gb`. Keep game logic separable from hardware access and cite
source addresses in comments. Without dynamic comparison, state the resulting
fidelity limits explicitly and do not claim unverified behavioral completeness.
"""

TASK_FOOTER = """
Work autonomously. Do not ask for confirmation; proceed on the best available
evidence and note your uncertainty in confidence values and NOTES.md.
"""


def write_task(
    ws: Path,
    program_id: str,
    *,
    agent_dir: Path | None = None,
    rom_path: Path | None = None,
) -> Path:
    """Write TASK.md; the dynamic step is included when the emulator is usable."""
    task = STATIC_TASK.format(program_id=program_id)
    if agent_dir is not None and rom_path is not None:
        task += "\n" + DYNAMIC_TASK.format(agent_dir=agent_dir, rom_path=rom_path)
    else:
        task += "\n" + STATIC_IMPLEMENT_TASK
    task += TASK_FOOTER
    path = ws / "TASK.md"
    path.write_text(task)
    return path
