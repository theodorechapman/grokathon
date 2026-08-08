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
4. Make it playable in the browser. Add a `web/` dir with an `index.html` and
   a TypeScript entry that runs your rebuilt ROM in the `gameboy-emulator`
   npm package, rendering to a canvas with arrow keys / buttons mapped to the
   joypad. Provide a runnable bun app: a `package.json` with a `start` script
   that builds the ROM (`make -C src`), bundles with `bun build`, and serves
   `web/` (e.g. `bun run start` opens a playable page). The C reconstruction
   is the game; the web layer only hosts the emulator.
5. Keep a running `NOTES.md` in this workspace summarizing the memory map you
   have recovered (which RAM addresses hold what) and open questions. These
   open questions are the handoff to later dynamic analysis.
"""

DYNAMIC_TASK = """6. Dynamically verify. You can execute the program in a headless emulator and
   observe it while it runs — read `dynamic_re.md` in this workspace for the
   full API and discipline. Control it from Python:

   ```python
   import sys; sys.path.insert(0, "{agent_dir}")
   from sameboy import SameBoy
   gb = SameBoy("{rom_path}")
   ```

   Use it to test the hypotheses behind your reconstruction: watchpoints on
   the RAM addresses in your recovered memory map, deterministic input
   replays, screenshots of what the game actually shows. Once your C build
   produces a ROM, differential-test it: open the original and
   `src/reconstructed.gb` in two SameBoy instances, drive both with the same
   input sequence, and compare the state you consider semantically equivalent.
   Where the runtime evidence and your C reconstruction disagree, investigate
   and fix — and raise or lower annotation confidence based on what you
   observe.
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
