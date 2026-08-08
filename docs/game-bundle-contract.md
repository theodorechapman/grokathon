# Game bundle contract

The interface between the pipelines and the arcade. Two producers, one consumer. The prompt-gen pipeline and the ROM reverse-engineering pipeline both emit this format. The arcade serves it and doesn't care which pipeline made it.

## Format

A bundle is one folder dropped into `arcade/public/games/<slug>/`:

```
arcade/public/games/<slug>/
  index.html      # the whole game, self-contained, runs in an iframe
  manifest.json   # metadata the arcade reads
  cover.png       # optional, share card + arcade tile (Grok Imagine or placeholder)
```

## Rules

- `index.html` is fully self-contained. Inline JS and CSS or relative paths inside the bundle folder only. No CDN, no external fetch. It must run offline in an iframe.
- Canvas or DOM rendering, either is fine. Must handle keyboard and touch.
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
  "createdAt": "2026-08-08T12:00:00Z"
}
```

`source` says which pipeline made it. `parent` is the slug it was remixed from, null for originals. That's the lineage the ranking system credits.

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

## Changing this contract

It's the one interface both sides depend on. Change it in this doc first, in a PR both sides see, before changing code.
