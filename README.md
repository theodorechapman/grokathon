# Grok Games

Ask Grok for a game, play it in your browser in seconds, reshape it live in plain words. Grokathon, Aug 8. Team: Supratik, Theo, Henry.

## Layout

```
docs/       PRD, pitch script, game bundle contract
arcade/     the hosted site: home grid + /g/[slug] player (Next.js)
pipeline/   agent work: ROM reverse engineering, prompt-gen, verify, repair
.claude/    skills: eng-standards, ship, frontend-design, webapp-testing
```

The two sides meet at one interface: `docs/game-bundle-contract.md`. Pipelines drop a self-contained bundle into `arcade/public/games/<slug>/` and the arcade picks it up at build time. No registry, no code change.

## Live

Production: https://playgrokgames.vercel.app (backup alias: grok-arcade.vercel.app). Deployed from Supratik's machine via `vercel --prod` in `arcade/`, runs on every ship that touches arcade.

## Run

```
cd arcade && bun install && bun run dev
```

Read `.claude/skills/eng-standards/SKILL.md` before writing code.

## Game Boy reverse engineering harness

This repository contains a deterministic agent-control harness for debugging Game
Boy ROMs with SameBoy. The current proof of concept targets `raw_rom/breakout.gb`
and supports the reverse-engineering pipeline described in
`breakout-reverse-engineering.md`.

Full setup, command reference, debugging recipes, and agent integration guidance:
`docs/emulator-agent-tooling.md`.

Unlike GUI automation, a small native bridge links directly to `libsameboy`
while Python owns validation, files, PNG encoding, tracing, and the agent-facing
protocol. An agent can:

- advance one instruction or a fixed number of frames;
- press and hold every Game Boy button;
- capture the framebuffer as PNG;
- read and write memory and CPU registers;
- stop on harness breakpoints and read/write watchpoints;
- evaluate expressions and run SameBoy debugger commands;
- save, restore, reset, and reload emulator state;
- load RGBDS symbol files; and
- record every command as replayable newline-delimited JSON.

### Setup

```bash
git submodule update --init
brew install cppp rgbds
make
```

`make` builds SameBoy and its DMG boot ROM, then creates the small
`bin/libgrokboy.dylib` native bridge (`libgrokboy.so` on Linux).

Run the end-to-end test:

```bash
make smoke
```

### Python agent API

```python
from agent.sameboy import SameBoy

with SameBoy("raw_rom/breakout.gb", trace="session.jsonl") as gameboy:
    gameboy.add_breakpoint(0x065D)
    stopped = gameboy.run(frames=300)
    print(stopped["registers"])

    gameboy.clear_breakpoints()
    gameboy.press("left", frames=10)
    print(gameboy.read(0xC0A0, 6).hex())
    gameboy.screenshot("breakout.png")
    print(gameboy.debug("disassemble/10 $065D"))
```

The Python wrapper is synchronous and has no third-party dependencies. It loads
the native bridge with `ctypes`; see `agent/sameboy.py` for the complete typed
control surface.

### Architecture

- `harness/grokboy.c` contains only SameBoy lifecycle, the tight execution loop,
  callbacks, memory/register access, and framebuffer copying.
- `harness/grokboy.h` is the small stable C ABI.
- `agent/sameboy.py` handles JSON, validation, PNG output, traces, paths, and
  ergonomic agent methods.

Keeping breakpoints and watchpoints native avoids an FFI call for every CPU
instruction. Keeping parsing and file formats in Python removes most unsafe
string and buffer handling from C.

### JSON protocol

The Python control layer accepts one JSON object per line:

```bash
printf '%s\n' \
  '{"cmd":"run","frames":60}' \
  '{"cmd":"read","address":"$C0A0","length":6}' \
  '{"cmd":"screenshot","path":"/tmp/breakout.png"}' |
  python3 agent/sameboy.py raw_rom/breakout.gb
```

Primary commands are `status`, `run`, `step`, `key`, `press`, `read`, `write`,
`registers`, `set-register`, `breakpoint`, `watchpoint`, `eval`, `debug`,
`screenshot`, `save-state`, `load-state`, `load-symbols`, `reset`, `reload`,
and `quit`.

Harness breakpoints and watchpoints stop deterministically between CPU
instructions. Raw SameBoy debugger commands are intended for inspection; use
the harness breakpoint/watchpoint commands when the agent must regain control
at a precise stop.
