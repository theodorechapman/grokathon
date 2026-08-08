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

## Run

```
cd arcade && bun install && bun run dev
```

Read `.claude/skills/eng-standards/SKILL.md` before writing code.
