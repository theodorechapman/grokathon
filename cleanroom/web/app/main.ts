/**
 * Entry: mount the engine demo and run the frame loop.
 */

import { createBench } from './bench-runner.ts';
import type { Bench } from './bench.ts';
import { el } from './dom.ts';
import { createMameBench } from './mame-bench.ts';
import { createEngineDemoPanel } from './panel-engine-demo.ts';
import type { Panel } from './panel.ts';

const AUTOSTART_DELAY_MS = 800;

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
  const panels: Panel[] = [createEngineDemoPanel(bench)];
  for (const panel of panels) root.append(panel.node);

  const fail = (error: unknown): void => {
    const message = error instanceof Error ? error.message : String(error);
    root.prepend(el('p', { class: 'failure', text: `demo stopped: ${message}` }));
    throw error;
  };

  let previous = performance.now();
  const frame = (now: number): void => {
    const seconds = (now - previous) / 1000;
    previous = now;
    try {
      bench.tick(seconds);
      const snapshot = bench.snapshot();
      for (const panel of panels) panel.update(snapshot);
    } catch (error) {
      fail(error);
      return;
    }
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
