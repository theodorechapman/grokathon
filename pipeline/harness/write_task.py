"""Write the per-run TASK.md: the concrete prompt the RE agent executes."""

from __future__ import annotations

from pathlib import Path

STATIC_TASK = """# Task: reverse-engineer an unknown binary and reimplement it in TypeScript

You are analyzing an unknown program, `{program_id}`, through the `staticre`
MCP tools (Ghidra-backed static analysis of an SM83 / Game Boy binary). You do
NOT know what the program is — infer everything from evidence.

Read `static_re.md` in this workspace first; it documents the tools and the
workflow. Then:

1. Map the program: entry point, memory regions, functions.
2. Work function by function. For each, form an evidence-backed hypothesis
   about what it does, and record it with the `annotate` tool (name, comment,
   tags, confidence, and evidence statements).
3. As your understanding solidifies, write a faithful TypeScript
   reimplementation of the program's logic under `src/` in this workspace.
   Structure it so the CPU/memory model and the game logic are separable.
   Prefer clear, evidence-traceable code over cleverness; cite the source
   addresses (e.g. `// ROM:0150`) in comments.
4. Make it playable. Add a small browser front-end (a `web/` dir with an
   `index.html` and a TypeScript entry) that renders the game to a canvas and
   maps the arrow keys / buttons to the input model, driving the same game
   logic from `src/` (do NOT fork the logic into the UI). Provide a runnable
   bun app: a `package.json` with a `start` script that builds the bundle with
   `bun build` and serves `web/` (e.g. `bun run start` opens a playable page).
   Keep the render layer thin and separate from the recovered logic.
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
   replays, screenshots of what the game actually shows. Where the runtime
   evidence and your TypeScript logic disagree, investigate and fix — and
   raise or lower annotation confidence based on what you observe.
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
