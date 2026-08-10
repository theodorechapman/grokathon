# AGENTS.md — working in cleanroom/

Guidance for coding agents (and new humans). Read this before changing code.

## What this project is

A **clean-room reimplementation** of the Bosch Motronic 1.7 engine controller
(Siemens SAB80C515) described in `SPECS.md`, plus browser demos that run it,
plus a bridge to the **real firmware** executing in a patched MAME. The split
matters:

- `src/` — the model. Every behavior traces to SPECS.md. No copied ROM code.
  The ROM image in the repo is synthesized to satisfy the documented checksum
  invariant, not dumped from hardware.
- `../ecu/` — the evidence side: the real ROM dump, static analysis, and the
  MAME lab (`../ecu/mame-sab80c535-lab/`) that executes the canonical
  firmware under strict "never invent hardware behavior" rules.
- `web/`, `web3d/`, `web-original/` — demos. See `DEMOS.md`.

**The honesty rule is the project's spine.** Provenance and availability are
first-class: pages must label whether data comes from the clean-room model or
MAME, and show `—` rather than fabricate a value the backend cannot supply.
Never loosen a gateway validator, invent MAME telemetry, or present model
output as recovered evidence. When the emulation stops at an unknown device,
that stop is the finding.

## Commands

```bash
npm test                 # node --test, no runtime deps (src + gateway tests)
npm run typecheck        # strict tsc for src/ and both web tsconfigs
./demo.sh                # build everything, serve the demo hub on :8099
npm run demo             # same, minus the MAME gateway
npm run demo:3d          # vite dev server for web3d/ (hot reload)
npm run demo:mame -- --mame <bin> --rom <rom>   # gateway alone (:8098)
cd web3d && npx tsc -p tsconfig.json            # typecheck 3D app alone
```

Node ≥ 22.18 required (`.ts` runs via native type stripping). `tsc` must be on
PATH for `web/build.js`. If `node` fails with an `_nvm_load` error in a
sandboxed shell on this machine, prepend the nvm bin dir and call
`command node`.

## Engineering standards (hard rules)

The full list lives in the repo skill `eng-standards`; the load-bearing ones:

- **≤ 250 lines per file.** Split before you exceed it.
- One main export per file, named after the file (`engine-pose.ts` →
  `poseEngine`). Kebab-case filenames; function names are verbs.
- Strict TS, no `any` outside quarantined API boundaries.
- Fail loud: no empty catches, no soft-passing verification, timeouts on
  every external call.
- Minimal dependencies — justify each in one line. (`web/` has zero runtime
  deps by design; `web3d/` allows `three` + `vite` only.)

## Architecture: the Bench contract

`web/app/bench.ts` defines `Bench` — the single interface every frontend
speaks and every backend implements:

- `bench-runner.ts` — the in-process clean-room ECU + a disclosed toy engine
  plant (`engine-plant.ts`). Read-write, deterministic, runs at frame rate.
- `mame-bench.ts` — a client for the MAME gateway (SSE state stream +
  control POSTs). May be read-only (`evidence` mode); assumptions locked.

Frontends select with `?backend=cleanroom|mame`. Anything a backend cannot
provide is expressed through `snapshot.availability` flags — render `—`, do
not guess. New panels/views should consume `Snapshot` only.

### Demo hub (`web/serve.js`)

Serves `/` (hub), `/2d`, `/classic`, static `/3d/`, and **proxies `/api/*`**
to the MAME gateway (`127.0.0.1:$MAME_PORT`, default 8098) so `?backend=mame`
pages stay same-origin — SSE streams through. The hub probes `/api/mode` per
page load to light the MAME card. Missing bundles gray out; they never crash
the server.

### 3D app (`web3d/`)

Vite + three.js, importing shared code straight from `../web/app/` (bench,
dom helper, cycle math) — do not fork those files. Key modules:

- `cylinder-cycle.ts` (in `web/app/`) — all four-stroke math: 720° cycle,
  flat-plane throws, firing order 1-3-4-2, valve lifts, spark/combustion
  intensities. Both the 2D and 3D renderers derive from it; change it once.
- `engine-model.ts` / `engine-pose.ts` — geometry build vs per-frame pose.
  Scene units are "cm-ish"; y-up (the 2D math is y-down — flip y, crankpin
  screen-x becomes z).
- Display crank speed is deliberately compressed (`displayRevPerSec`) —
  real crank speed aliases at 60 fps. Vibration frequency tracks true RPM.
- The attract script (`demo-script.ts`) writes throttle every frame. That is
  fine in-process and hostile over HTTP, so auto mode is **cleanroom-only**
  (`autoCapable` in `main.ts`). Keep any new per-frame control writes behind
  the same guard.

## MAME lab interop

- Canonical current binary: `/tmp/mame-motronic-mcu-core/motronic175`
  (`/tmp` is volatile — rebuild after reboots). Incremental rebuild ~7 s:
  `cd ../ecu/mame-sab80c535-lab/workstreams/accuracy-xdata &&
  MAME_DIR=/tmp/mame-motronic-mcu-core JOBS=4 bash build.sh`
- ROM for integrated runs: `../ecu/analysis/TotalCombinedROM.bin` (the raw
  dump `../ecu/318i_175_soft1267356378.bin` is 32 KiB; the combined 40 KiB
  image is what the driver stages as `totalcombinedrom.bin`).
- The bridge protocol is validated with `exactKeys` on both sides. Symptom
  `response.counters.<x> is not permitted` = binary/source skew → rebuild
  the binary. **Never relax the validators to make a stale binary pass.**
- Evidence boundary: the emulation reaches startup frontier `5D0D` and the
  supervisor loop but not the cyclic executive (`601A`), so the firmware
  never commands fuel/spark. RPM during "running" is starter + decay. See
  `../ecu/mame-sab80c535-lab/HANDOFF.md` before touching anything there.

## Gotchas

- `web/build.js` inlines **every** compiled module into one HTML file; dead
  modules bloat the bundle, so delete unused files rather than orphaning them.
- `web-original/` is a frozen artifact. Do not rebuild or "fix" it.
- Ports: hub 8099 (`PORT`), gateway 8098 (`MAME_PORT`). The gateway defaults
  to 8098 specifically so both run together; don't reuse `PORT` for it.
- `web/dist/` and `web/.build/` are committed build outputs — rebuild before
  shipping so sources and dist stay in sync.
- Playwright screenshots of the 3D app in headless Chromium need
  `--use-gl=angle`.
