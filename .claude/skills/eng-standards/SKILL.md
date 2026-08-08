---
name: eng-standards
description: Use when writing, reviewing, or refactoring any code in this repo. Hard rules on file size, structure, modularity, errors, and dependencies. Load before the first line of code.
---

# Engineering standards

Hard rules. Violating one is a bug, fix it before shipping.

## Files

- Under 250 lines per file. Over that, split it.
- One main export per file, named after the file. `verify-game.ts` exports `verifyGame`. Helpers stay private to the file.
- Kebab-case filenames. Function names are verbs.

## Structure

- Pipeline stages are separate modules: spec, build, verify, repair, ship, customize. A stage imports its neighbors' types, never their internals.
- Pure functions by default. Side effects (fs, network, sandbox exec) live at the edges in a thin layer, so everything else is testable without mocks.
- Shared types in one place. No duplicate type definitions drifting apart.
- Duplicate code twice before extracting an abstraction. Premature abstraction costs more than repetition in a 12-hour build.

## Errors

- Fail loud. No empty catch blocks, no swallowed promises.
- The verify gate never soft-passes. If verification errors, the game failed verification.
- Every external call (Grok API, sandbox, Imagine) has a timeout and a defined failure path.

## Dependencies

- Minimal. Justify every package in one line in the PR. No framework for something 30 lines of code does.
- Templates ship with placeholder assets so no external call blocks a playable game.

## TypeScript

- Strict mode on. No `any` unless quarantined at an API boundary with a comment.
- Game spec is a typed schema (structured outputs). The spec type is the contract between all stages.

## Repo layout

- Root stays clean: README.md plus folders only (docs/, arcade/, pipeline/, .claude/). No stray files at root.
- arcade/ is the consumer surface, pipeline/ is the agent work. They meet only at the game bundle contract (docs/game-bundle-contract.md).

## Model strategy

- Fable plans, reviews, and owns cross-cutting calls: architecture, contract changes, anything touching both arcade and pipeline.
- Implementation fans out to Opus or Sonnet subagents, one module per agent, each told to load this skill and the bundle contract first.
- No subagent changes the bundle contract. Contract changes are a doc PR both sides see, then code.

## Review test

Before any PR: does every file do one thing, would a teammate know where a change goes without asking, and does `grep -rn "catch (e) {}"` come back empty.
