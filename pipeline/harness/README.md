# harness — headless RE agent runner

Launches a headless coding agent in an isolated, timestamped workspace with
access to the `staticre` (Ghidra) MCP server plus normal file tools
(read/write/search/shell). Later runs will add MCP servers for computer-use of
the running game and live memory inspection.

## Usage

```sh
# default: Grok, blinding the ROM into a fresh workspace
python harness/run_agent.py --rom raw_rom/breakout.gb

# scaffold only, print the command, don't launch (safe to run anytime)
python harness/run_agent.py --rom raw_rom/breakout.gb --dry-run

# use Codex instead, or override the model / name the run
python harness/run_agent.py --rom raw_rom/breakout.gb --engine codex
python harness/run_agent.py --rom raw_rom/breakout.gb --model grok-4 --label ball-hunt
```

## What a run produces

`workspaces/<UTC-timestamp>[-label]/`:

| path | contents |
|---|---|
| `.grok/config.toml` (or `.codex/`) | MCP config: only the `staticre` server, with a per-workspace Ghidra project dir |
| `rom/program-<sha>.gb` | blinded copy of the ROM (title stripped, checksums fixed) |
| `static_re.md` | the RE skill/instructions (copied from `.claude/skills/static-re/`) |
| `TASK.md` | the concrete task prompt |
| `ghidra_work/` | the agent's private Ghidra project + evidence sidecar |
| `src/` | where the agent writes its TypeScript reimplementation |
| `NOTES.md` | (agent-written) recovered memory map + open questions |
| `run_meta.json` | provenance: engine, model, ROM hashes, program id |
| `agent.log` | full streaming transcript of the run |

Each run is fully self-contained: separate Ghidra project, separate output,
separate blinded ROM. Runs never share state, so several can be compared.

## Notes

- The agent only ever sees the blinded program id, never the original
  filename or header title.
- Engines run with approvals bypassed because the workspace is the sandbox;
  keep the harness itself outside anything sensitive.
- The first `staticre` tool call in a run is slow (JVM start + auto-analysis);
  this is expected.

## Containerized runs (agent-in-a-box)

`docker/` builds an image containing the full stack: staticre backend, Codex
CLI, bun, this harness, and the grokboy SameBoy bridge (`agent/sameboy.py` +
`bin/libgrokboy.so`) for dynamic analysis.

```sh
pipeline/harness/docker/build.sh        # build (needs staticre:local base)
pipeline/harness/docker/smoke.sh        # verify the emulator bridge in-container
pipeline/harness/docker/run.sh rom.gb   # one containerized agent run
```

Screenshots from the emulator bridge are PNGs upscaled 3x by default
(480x432) so vision models can read them; pass `scale` (1..8) to override.
