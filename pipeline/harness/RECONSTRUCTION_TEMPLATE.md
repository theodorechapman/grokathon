# Reconstruction ledger

This file tracks whether the *program* has been recovered, not whether a short
demo path happens to match. Update it throughout the run. Every implemented
dynamic subsystem needs an evidence-backed model of its state and transition.

## Top-level control model

- Main-loop / interrupt entry points:
- Mode and scene state machine:
- Per-frame update order:
- Input edge/hold handling:
- Timing source and cadence:
- Rendering boundary (direct, shadow OAM, VBlank, DMA):

## Subsystem ledger

| Subsystem | Original routines | Original state | Experiments | Candidate implementation | Status / gaps |
|---|---|---|---|---|---|
| Mode / scene transitions | unknown | unknown | pending | pending | open |
| Input processing | unknown | unknown | pending | pending | open |
| Player / primary object motion | unknown | unknown | pending | pending | open |
| Physics, collision, and constraints | unknown | unknown | pending | pending | open |
| Other actors / board / world state | unknown | unknown | pending | pending | open |
| Animation and rendering | unknown | unknown | pending | pending | open |
| Scoring / progress / failure | unknown | unknown | pending | pending | open |
| Audio triggers | unknown | unknown | pending | pending | open |

Use `not applicable` only with evidence. Split, rename, or add rows to reflect
the actual program.

## Recovered transition rules

For each dynamic subsystem, state the rule in plain language or pseudocode and
cite the original routine/address and experiment that support it. Include
update order, units/fixed-point representation, counters, thresholds, and edge
conditions where relevant.

## Behavioral challenge matrix

| Starting state | Input and duration | Expected transition | Evidence captured | Candidate result |
|---|---|---|---|---|
| cold boot | idle | pending | pending | pending |
| title / attract | varied Start timing | pending | pending | pending |
| active play | long idle | pending | pending | pending |
| active play | taps vs holds | pending | pending | pending |
| active play | simultaneous inputs | pending | pending | pending |
| boundary / collision | adversarial timing | pending | pending | pending |

Add program-specific branches, mechanics, failure states, and restarts. A
single linear happy path is insufficient evidence.

## Assets and dynamic state

List captured tile, map, palette, and sprite assets with provenance. Explicitly
separate immutable assets from values that the original changes over time.
Screenshots, OAM snapshots, and tilemaps may seed static assets; they must not
replace a recovered update rule.

## Completion audit

- Core reachable modes exercised:
- Core mechanics with recovered transition rules:
- Alternate timings and branch experiments:
- First known divergence, if any:
- Known missing or stubbed behavior:
- Untested reachable behavior:
- Why the agent judges the reconstruction complete or incomplete:

The agent owns the completion decision. It must be honest: any known missing
core mechanic, snapshot-driven substitute for dynamic behavior, or unexplained
reachable state keeps the reconstruction incomplete.

Before stopping, search this ledger and `NOTES.md` for `open`, `pending`,
`partial`, `stubbed`, `unknown`, `unrecovered`, and `untested`. An occurrence
that describes reachable core behavior is a work item, not a final limitation.
Continue with the highest-impact item.

Immediately before the final response, write `RUN_STATUS.json`:

```json
{
  "status": "complete | hard_blocked | incomplete",
  "summary": "short evidence-based status",
  "next_priority": "empty only when complete",
  "blockers": []
}
```

`complete` means no known missing or contradicted reachable core mechanic.
`hard_blocked` is reserved for unavailable evidence caused by a tool or
environment failure after at least three distinct recovery attempts.
`incomplete` means the harness must continue in this workspace, starting with
`next_priority`.
