"""Write the per-run TASK.md: the concrete prompt the RE agent executes."""

from __future__ import annotations

from pathlib import Path

STATIC_TASK = """# Task: reverse-engineer an unknown binary and reimplement it in raw C

You are analyzing an unknown program, `{program_id}`, through the `staticre`
MCP tools (Ghidra-backed static analysis of an SM83 / Game Boy binary). You do
NOT know what the program is — infer everything from evidence.

Read `static_re.md` in this workspace first; it documents the tools and the
workflow. Your goal is to recover the program's causal structure and implement
that program, not to imitate screenshots or pass a prerecorded input sequence.

1. Map the program: entry point, memory regions, functions, interrupts, and
   bank-switching mechanisms.
2. Recover the top-level control model before substantial C implementation:
   identify the main loop or interrupt-driven loop, mode/state transitions,
   input sampling, timing source, and per-frame subsystem update order. Follow
   reads and writers of the controlling state in both disassembly and runtime.
3. Keep two living evidence documents:
   - `NOTES.md`: memory map, observations, hypotheses, confidence, and open
     questions.
   - `RECONSTRUCTION.md`: the supplied subsystem ledger. Fill in original
     routines, original state, experiments, candidate implementation, and
     gaps. For each dynamic subsystem, record an evidence-backed transition
     rule (including counters, units, thresholds, and update order).

   Annotate behavior-critical functions and data as evidence supports them;
   annotation count is not a completion target.
"""

DYNAMIC_TASK = """4. Execute the original program in a headless emulator and
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

   Drive the original with deterministic experiments, inspect screenshots, and
   watchpoint RAM addresses in your recovered memory map. Use save states to
   branch from identical starting conditions. Vary idle duration, tap/hold
   duration, simultaneous inputs, boundaries, collisions, mode transitions,
   failure, and restart where reachable. A single happy-path timeline is not a
   behavioral model.

5. Recover banked code before reconstruction. If `memory_map` contains ROM1,
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

6. Implement the behavior supported by your evidence in raw C under `src/`,
   targeting the Game Boy with GBDK-2020 (`lcc` is at `/opt/gbdk/bin/lcc`).
   `src/Makefile` must build a real `src/reconstructed.gb`. Keep game logic
   separable from hardware access and cite source addresses in comments.

   Recover the real graphics for exercised screens. Use asset tracing for
   direct copies and `video_state()` for post-decompression CGB state. Preserve
   both VRAM banks and both CGB palette memories where applicable. Static asset
   capture is valid for immutable art. Never substitute checkpoint-specific
   OAM, tilemaps, palettes, or coordinates for time-varying logic. Dynamic
   state must be produced by recovered transitions.

7. Use the compiled reconstruction in a second, independent emulator as a
   differential experiment. CompareBoy is an evidence and falsification tool,
   not a test suite, score, gate, or definition of completion. Use the
   interface documented in `dynamic_re.md`:

   ```python
   import sys; sys.path.insert(0, "{agent_dir}")
   from compareboy import SameBoyPair

   with SameBoyPair(
       "{rom_path}",
       "src/reconstructed.gb",
       artifacts="artifacts/compare",
   ) as pair:
       pair.boot()
       pair.trace("title-idle", 60)
       pair.press("start", frames=10)
       pair.save_pair("game-start")
       pair.trace("gameplay-idle", 118, probes=[...])
       pair.load_pair("game-start")
       pair.trace("gameplay-right", 118, buttons=["right"], probes=[...])
       pair.write_report("artifacts/compare/report.json")
   ```

   Add named semantic probes for corresponding original and candidate state;
   their addresses may differ. Prefer continuous traces around motion and
   transitions, locate the first divergent frame, inspect sprite/tile/memory
   localization, and use watchpoints to connect changing original state to its
   writer routine. Rebuild, replay, and repair the causal model. The candidate
   is never evidence about what the original does; it is how you challenge and
   falsify your reconstruction.

8. You decide when the reconstruction is done. Before declaring it complete,
   perform the completion audit in `RECONSTRUCTION.md`: explain the recovered
   main loop and update order; account for each reachable core subsystem; cite
   original routines/state and experiments for its transition rule; challenge
   alternate timings and branches; and report the first known divergence plus
   untested scope. A clean build, visual similarity, exact sampled frames, or a
   comparison report is never sufficient by itself. You MUST declare the work
   incomplete if you know a core mechanic is absent, stubbed, snapshot-driven,
   or contradicted by evidence. Do not hide such gaps behind scoped wording.
"""

STATIC_IMPLEMENT_TASK = """4. Reimplement the evidence-supported program in raw C under `src/`,
targeting the Game Boy with GBDK-2020. `src/Makefile` must build a real
`src/reconstructed.gb`. Keep game logic separable from hardware access and cite
source addresses in comments. Complete `RECONSTRUCTION.md`, including causal
transition rules and the completion audit. Without dynamic comparison, state
the resulting fidelity limits explicitly and do not claim unverified behavioral
completeness.
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
