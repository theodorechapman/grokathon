---
name: handoff
description: Use when Supratik says "handoff", "give me a handoff prompt", "starting a new terminal", or a session nears context limits. Produces a paste-ready prompt for a fresh orchestration terminal and preserves state.
---

# Handoff

Produce a clean handoff so a fresh terminal continues without re-learning anything. Do these in order:

1. **Update memory first.** Rewrite the relevant project memory file (for grokathon: `grokathon-lanes`) to current reality: architecture, what's live, secrets locations, how to restart things. The handoff prompt references memory instead of duplicating it.
2. **Sweep the task list.** Mark done things done. The board must be honest before it transfers.
3. **Inventory background processes.** Anything started with run_in_background (runners, monitors, dev servers) DIES when the terminal closes. The handoff prompt must open with exact restart commands for each, marked FIRST.
4. **Write the prompt** with these sections, in this order:
   - One-line project context: repo path, live URL, which memory + docs to read, the ship flow.
   - FIRST: background restart commands.
   - What works end to end (one paragraph, so the next session verifies instead of rebuilds).
   - Open items in priority order, each with enough file-path context to start cold.
   - Gotchas: the traps this session hit (build clobbers, push races, env locations).
5. **Deliver the prompt in the chat message** between `---` markers so it copies clean. Note that background processes die when the old terminal closes, so start the new one first.

Style: dense, imperative, file paths inline. No pleasantries. The reader is Claude, not a human.
