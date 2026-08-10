/**
 * Entry: the bench rendered as a 3D engine bay. `?backend=mame` swaps the
 * local clean-room model for the MAME gateway (real firmware) behind the same
 * Bench interface; the hub proxies /api/* so the page stays same-origin.
 */

import type { Bench } from '../../web/app/bench.ts';
import { createBench } from '../../web/app/bench-runner.ts';
import { el } from '../../web/app/dom.ts';
import type { EngineViewState } from '../../web/app/engine-view.ts';
import { createMameBench } from '../../web/app/mame-bench.ts';
import { createDemoScript } from './demo-script.ts';
import { createEngineModel } from './engine-model.ts';
import { poseEngine } from './engine-pose.ts';
import { createHud } from './hud.ts';
import { createSceneRig } from './scene-rig.ts';

const AUTOSTART_DELAY_MS = 800;
const TAU = Math.PI * 2;
const CYCLE = 2 * TAU;

/** Real crank speed aliases at 60 fps; compress it so the cycle stays readable. */
const displayRevPerSec = (rpm: number): number => (rpm <= 0 ? 0 : 0.9 + (rpm / 7000) * 3.4);

const selectBench = (): Bench => {
  const backend = new URL(window.location.href).searchParams.get('backend') ?? 'cleanroom';
  if (backend === 'cleanroom' || backend === 'local') return createBench();
  if (backend === 'mame') return createMameBench(window.location.href);
  throw new Error(`unknown bench backend "${backend}"`);
};

const mount = (): void => {
  const root = document.querySelector('#app');
  if (root === null) throw new Error('#app is missing from the page shell');

  const bench = selectBench();
  // The attract script hammers setThrottle every frame — fine against the
  // in-process model, hostile to a gateway. Auto mode is cleanroom-only.
  const autoCapable = bench.identity().backend === 'cleanroom';
  const rig = createSceneRig();
  const model = createEngineModel();
  rig.scene.add(model.group);

  // Attract mode: the script sweeps the levers until a human takes over.
  const demo = createDemoScript();
  let demoActive = autoCapable;
  const hud = createHud(bench, {
    onManual: () => {
      demoActive = false;
      hud.setAuto(false);
    },
    onAutoToggle: () => {
      if (!autoCapable) return;
      demoActive = !demoActive;
      hud.setAuto(demoActive);
      if (demoActive) {
        demo.reset();
        if (!bench.isRunning()) bench.start();
      }
    },
  });
  hud.setAuto(demoActive);
  if (!autoCapable) hud.node.classList.add('hud--no-auto');
  root.append(rig.canvas, hud.node);

  const fail = (error: unknown): void => {
    const message = error instanceof Error ? error.message : String(error);
    root.prepend(el('p', { class: 'hud-failure', text: `demo stopped: ${message}` }));
    throw error;
  };

  const resize = (): void => rig.setSize(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', resize);
  resize();

  let cycleAngle = 0;
  let vibPhase = 0;
  let previous = performance.now();

  const frame = (now: number): void => {
    const seconds = Math.min(0.05, Math.max(0, (now - previous) / 1000));
    previous = now;

    if (demoActive && bench.isRunning()) {
      const levers = demo.advance(seconds);
      bench.setThrottle(levers.throttle);
      bench.setBrake(levers.brake);
      hud.syncLevers(levers.throttle, levers.brake);
    }

    try {
      bench.tick(seconds);
    } catch (error) {
      fail(error);
      return;
    }
    const snapshot = bench.snapshot();
    const state: EngineViewState = {
      rpm: bench.rpm(),
      running: bench.isRunning(),
      throttle: bench.throttle(),
      fuelled: snapshot.fuel !== null && !snapshot.fuel.cut && snapshot.fuel.pulseCount > 0,
      cutting: snapshot.limiter.cutStageActive,
    };

    if (state.running && state.rpm > 0) {
      cycleAngle = (cycleAngle + displayRevPerSec(state.rpm) * TAU * seconds) % CYCLE;
      vibPhase = (vibPhase + (state.rpm / 60) * TAU * seconds) % TAU;
    }

    poseEngine(model, state, cycleAngle, vibPhase);
    hud.update(snapshot);
    rig.render(seconds);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.setTimeout(() => {
    const provenance = bench.provenance();
    if (provenance.mode === 'demo' && provenance.controls === 'read-write') bench.start();
  }, reduced ? 0 : AUTOSTART_DELAY_MS);

  (window as unknown as { motronic: typeof bench }).motronic = bench;
};

mount();
