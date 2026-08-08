# Game bundle contract

The interface between the pipelines and the arcade. Two producers, one consumer. The prompt-gen pipeline and the ROM reverse-engineering pipeline both emit this format. The arcade serves it and doesn't care which pipeline made it.

## Format

A bundle is one folder dropped into `arcade/public/games/<slug>/`:

```
arcade/public/games/<slug>/
  manifest.json   # metadata the arcade reads
  index.html      # browser game entry point, or:
  game.gb         # Game Boy ROM loaded by the arcade's shared emulator
  cover.png       # optional, share card + arcade tile
```

Every bundle has a manifest and exactly one playable entry point. Browser games
provide `index.html`. Game Boy reconstructions provide a `.gb` file and name it
in the manifest's `rom` field.

## Rules

- `index.html` is fully self-contained. Inline JS and CSS or relative paths inside the bundle folder only. No CDN, no external fetch. It must run offline in an iframe.
- A `.gb` bundle contains only the compiled ROM; the emulator and player UI belong to the arcade.
- Canvas or DOM rendering, either is fine. Must handle keyboard and touch.
- The game must size itself to its viewport: scale to fit, no scrolling, nothing cut off, at any frame size from a phone to a desktop. The arcade gives the iframe a fixed box and disables scroll, so a game that overflows loses content. The verify bot should treat overflow as a failure.
- No console errors on boot. The verify bot treats them as failures.

## manifest.json

```json
{
  "slug": "breakout-classic",
  "title": "Breakout",
  "description": "one line",
  "controls": "arrows or touch to move",
  "source": "rom-re | prompt-gen | remix",
  "parent": null,
  "rom": "game.gb",
  "createdAt": "2026-08-08T12:00:00Z"
}
```

`source` says which pipeline made it. `parent` is the slug it was remixed from, null for originals. That's the lineage the ranking system credits.
`rom` is required for Game Boy bundles and omitted for `index.html` bundles.

Optional manifest fields the arcade understands: `creator` (X handle from the job file, shows "by @handle" on the card and feeds the creator leaderboard), `players` (1 or 2, drives shelf filters, defaults to 1), `tags` (string list, reserved for future filters), `scoring` ("time" or "points", default points). Time-scored games report elapsed milliseconds in nova:score and the boards rank fastest first; points games rank highest first.

Score reporting (REQUIRED): when a run ends (win, lose, or game over), the game MUST `window.parent.postMessage({ type: "nova:score", score: <number>, outcome: "win" | "loss", message: "you killed 14 zombies" }, "*")`. `score` is required; 0 is fine. `outcome` and `message` are optional: `outcome` defaults to "win", and `message` (max 120 chars) replaces the arcade's generic outcome line on the shared end screen — write it in the game's own voice. This drives the end-of-run screen (score, claim/sign-in, retry, remix) and the leaderboards; a game that never emits it never gets players on a board. The arcade renders the end screen, so the game must NOT draw its own claim/sign-in UI — freeze play and post the message. The verify bot should check the message fires on game over.

## Adding a game

Drop the folder in, done. The arcade scans `public/games/` at build time and lists every folder with a valid manifest. No registry file to update, no code change.

## Jobs: how asks reach the pipeline

The repo is the queue. `POST /api/create` on the arcade commits a job file to `pipeline/jobs/<slug>.json`. The pipeline consumes jobs from that folder and deletes the file when the bundle ships (same commit that adds the bundle, so the queue never lies).

```json
{
  "id": "dodge-falling-tacos-a1b2c3",
  "slug": "dodge-falling-tacos-a1b2c3",
  "prompt": "dodge falling tacos on a rooftop",
  "parent": null,
  "requestedAt": "2026-08-08T12:00:00Z",
  "source": "site"
}
```

`slug` is the folder name the bundle must ship under. `parent` non-null means remix: start from the parent's bundle. `source` says where the ask came from (site, grok, x).

Optional but nice: the pipeline can write a `status` string into the job file as it works ("writing the spec", "bot is playing it", "repairing"). The waiting room at /g/&lt;slug&gt; shows it live to the person who asked. No status means it displays "building".

## Changing this contract

It's the one interface both sides depend on. Change it in this doc first, in a PR both sides see, before changing code.
