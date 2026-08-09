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
   targeting the Game Boy with GBDK-2020. `src/Makefile` must build a real
   `src/reconstructed.gb`; invoke it through `./build_rom.sh` so the same task
   works with either the native or containerized toolchain. Keep game logic
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

8. Your objective is a complete causal reconstruction, not a useful partial
   reconstruction or an audit of missing work. Work in this continuous loop:

   1. Select the highest-impact unresolved subsystem or reachable state.
   2. Gather new static and dynamic evidence.
   3. Form a concrete transition model and try to falsify it.
   4. Implement or repair the model.
   5. Compare original and candidate, then update the ledger.
   6. Immediately select the next gap and repeat.

   A working ROM, successful build, visual match, comparison report, or list of
   limitations is only a checkpoint. Do not end the run at a checkpoint. Do
   not spend time polishing already-matching presentation while core behavior
   remains open.

   When behavior is difficult to reach normally, do not merely mark it
   untested. Trace its dispatcher and callers, branch from save states, alter
   relevant original state through emulator memory writes, force the mode when
   safe, and observe the responsible routines directly. If one approach fails,
   use a materially different static or dynamic approach.

9. Before attempting to stop, perform the completion audit in
   `RECONSTRUCTION.md`, then search it and `NOTES.md` for `open`, `pending`,
   `partial`, `stubbed`, `unknown`, `unrecovered`, and `untested`. If any term
   describes reachable core behavior, resume the loop. Uncertainty, complexity,
   an imperfect input sequence, or the existence of remaining work is not a
   blocker; each is the next experiment queue.

   You own the final decision. Immediately before your final response, write
   `RUN_STATUS.json` with exactly one of these statuses:

   - `complete`: you judge the reachable core program causally reconstructed,
     with no known missing, stubbed, snapshot-driven, or contradicted core
     mechanic.
   - `hard_blocked`: necessary evidence is genuinely unavailable because a
     tool or environment failure prevents further work. Record at least three
     materially distinct attempts to overcome every blocker.
   - `incomplete`: use only if the process is being forced to yield before the
     work is done. Include the single highest-priority next action so another
     pass can continue immediately.

   The file must be valid JSON with this shape:

   ```json
   {{
     "status": "complete | hard_blocked | incomplete",
     "summary": "short evidence-based status",
     "next_priority": "empty only when complete",
     "blockers": []
   }}
   ```

   A truthful `incomplete` declaration does not finish the task. The harness
   will start another pass in this same workspace. Do not summarize prior work
   on that pass; attack the recorded priority and continue the loop.
"""

STATIC_IMPLEMENT_TASK = """4. Reimplement the evidence-supported program in raw C under `src/`,
targeting the Game Boy with GBDK-2020. `src/Makefile` must build a real
`src/reconstructed.gb`; invoke it through `./build_rom.sh`. Keep game logic
separable from hardware access and cite source addresses in comments. Complete
`RECONSTRUCTION.md`, including causal transition rules and the completion audit.
Without dynamic comparison, state the resulting fidelity limits explicitly and
do not claim unverified behavioral completeness.

Work continuously from the highest-impact open ledger row through evidence,
model, implementation, and verification. A build or a limitations report is a
checkpoint, not a reason to stop. Before your final response write
`RUN_STATUS.json` using the schema and completion rules in `RECONSTRUCTION.md`.
If core work remains, declare `incomplete` with the next concrete action; the
harness will continue in the same workspace.
"""

TASK_FOOTER = """
Work autonomously. Do not ask for confirmation; proceed on the best available
evidence. Treat uncertainty as an experiment queue and resolve it wherever the
available tools permit.
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
