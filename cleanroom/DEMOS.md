# Demos

One command:

```bash
./demo.sh        # → http://localhost:8099/
```

It builds everything, starts the MAME gateway when the emulator binary and ROM
exist (and says how to get them when they don't), and serves a hub linking:

| URL | What | Backed by |
|---|---|---|
| `/3d/` | three.js engine bay — attract mode, faders, live scope | clean-room model, in-browser |
| `/2d` | 2D canvas cutaway with the four-stroke cycle | clean-room model, in-browser |
| `/classic` | the original demo, frozen as first shipped | clean-room model, in-browser |
| `/3d/?backend=mame` | the 3D bay on the **real firmware** | MAME gateway on :8098 |

The MAME card on the hub lights up only while the gateway answers; without it
everything else still works. `/2d?backend=mame` works too.

## Pieces

- `web/` — 2D demo sources, the single-file bundler (`build.js`), and the hub
  server (`serve.js`, which also proxies `/api/*` to the gateway).
- `web3d/` — Vite + three.js app. `npm run demo:3d` gives a hot-reload dev
  server while hacking on it.
- `web-original/` — the frozen original bundle (see its README).
- `web/gateway/` — bridges a patched MAME running the canonical ROM to the
  same Bench interface the pages already speak.

## Notes

- Ports: hub `:8099` (`PORT`), gateway `:8098` (`MAME_PORT`).
- On the MAME backend, RPM is real but PULSE/ADVANCE show `—`: the emulation
  executes the firmware's reset/supervisor/timer paths but does not reach the
  cyclic executive, so no fuel or spark is ever commanded. That boundary is
  documented evidence, not a bug — see `../ecu/mame-sab80c535-lab/HANDOFF.md`.
- `"response.counters.… is not permitted"` from the gateway means the MAME
  binary is stale relative to the bridge validators — rebuild it (command in
  `demo.sh`'s skip message).
