/**
 * Entry point: build the bench, mount the panels, run the frame loop.
 *
 * One `Ecu` is stepped in real time and read back once per frame. If anything
 * throws, the loop stops and says so rather than quietly drawing stale numbers.
 */

import { createBench } from './bench-runner.ts';
import type { Bench } from './bench.ts';
import { el } from './dom.ts';
import { createMameBench } from './mame-bench.ts';
import { createBenchPanel } from './panel-bench.ts';
import { createEvidencePanel } from './panel-evidence.ts';
import { createHeaderPanel } from './panel-header.ts';
import { createMemoryPanel } from './panel-memory.ts';
import { createScopePanel } from './panel-scope.ts';
import type { Panel } from './panel.ts';

const AUTOSTART_DELAY_MS = 1400;

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
  const panels: Panel[] = [
    createHeaderPanel(bench),
    createBenchPanel(bench),
    createMemoryPanel(),
    createScopePanel(bench),
    createEvidencePanel(bench),
  ];
  for (const panel of panels) root.append(panel.node);

  const fail = (error: unknown): void => {
    const message = error instanceof Error ? error.message : String(error);
    root.prepend(el('p', { class: 'failure', text: `the bench stopped: ${message}` }));
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

  // The selected bench is also available for inspection and manual ticking.
  (window as unknown as { motronic: typeof bench }).motronic = bench;
};

mount();
