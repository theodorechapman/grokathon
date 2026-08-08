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
2. Work function by function. For each, form an evidence-backed hypothesis
   about what it does, and record it with the `annotate` tool (name, comment,
   tags, confidence, and evidence statements).
3. As your understanding solidifies, write a faithful reimplementation of the
   program in raw C under `src/` in this workspace, targeting the Game Boy
   with GBDK-2020 (`lcc` is at `/opt/gbdk/bin/lcc`), and build it to a real
   ROM: `src/` gets a Makefile whose default target produces
   `src/reconstructed.gb`. Keep game logic separable from hardware access.
   Prefer clear, evidence-traceable code over cleverness; cite the source
   addresses (e.g. `/* ROM:0150 */`) in comments.
4. Keep a running `NOTES.md` in this workspace summarizing the memory map you
   have recovered (which RAM addresses hold what) and open questions. These
   open questions are the handoff to later dynamic analysis.
"""

DYNAMIC_TASK = """5. Dynamically verify. You can execute the program in a headless emulator and
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

   Play the game: drive it with real input sequences, watch the screen, and
   watchpoint the RAM addresses in your recovered memory map. Where the
   runtime behavior and what your C reconstruction would predict disagree,
   investigate and fix the C — and raise or lower annotation confidence based
   on what you observe. Only ever run the original program in the emulator,
   never your own build.

   If the program uses more than one ROM bank (see `memory_map`: ROM1, ROM2,
   … exist and static analysis found few or no functions in them), you MUST
   recover the banked code before reconstructing — that is where most of the
   game lives. Turn on the emulator's call-target trace, play through as much
   of the game as you can, collect the seeds, and pass them to the
   `create_functions` static tool. Read the "Recovering bank-switched code"
   section of `dynamic_re.md` for the exact loop. Do this early, then annotate
   and reconstruct the now-visible banked functions.

   Also collect full physical execution coverage with `execution_trace()` and
   `execution_coverage()`. Use it to identify every ROM bank and code region
   actually reached, and use the bank-event timeline to design input sequences
   that expand coverage. Call targets remain the correct function seeds.

   Recover the real graphics too. Use the emulator's asset trace while the
   game draws its screens, then embed the actual tiles and maps in your
   reconstruction instead of placeholder art: `extract_data` for uncompressed
   ROM->VRAM copies, or `video_state()` snapshots for decompressed/CGB assets.
   Preserve each run's destination VRAM bank and recover both CGB palettes.
   Read the "Recovering graphics" section of `dynamic_re.md`. The reconstruction
   should render with the game's own art for whatever screens you exercised.
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
    task += TASK_FOOTER
    path = ws / "TASK.md"
    path.write_text(task)
    return path
