/**
 * Compact bench scope docked at the bottom of the HUD: the controller's
 * output events (and the crank stimulus) on a rolling 30 ms window, drawn by
 * the same scope-trace painter as the 2D demo.
 */

import type { Bench, Snapshot, TraceLane } from '../../web/app/bench.ts';
import { el } from '../../web/app/dom.ts';
import { drawScope } from '../../web/app/scope-trace.ts';

const WINDOW_MS = 30;
const DIVISIONS = 10;

interface Lane {
  key: TraceLane;
  label: string;
  stimulus?: boolean;
}

const LANES: readonly Lane[] = [
  { key: 'capture', label: 'crank', stimulus: true },
  { key: 'ignition-charge', label: 'coil chg' },
  { key: 'p15-ignition', label: 'ign p1.5' },
  { key: 'cc2-cc3-schedule', label: 'inj cc2/3' },
  { key: 'idle-actuator', label: 'idle' },
];

const COLOURS = {
  screen: '#0b1016',
  graticule: 'rgba(148, 170, 200, 0.14)',
  trace: '#7ee2c5',
  stimulus: '#5a6a7e',
};

export interface HudScope {
  node: HTMLElement;
  update(snapshot: Snapshot): void;
}

export const createHudScope = (bench: Bench): HudScope => {
  const canvas = el('canvas', { class: 'hud-scope-canvas' });
  const timebase = el('span', {
    class: 'hud-scope-timebase',
    text: `${WINDOW_MS / DIVISIONS} ms/div`,
  });
  const node = el('section', {
    class: 'hud-scope',
    children: [
      el('div', {
        class: 'hud-scope-legend',
        children: LANES.map((lane) => el('span', { text: lane.label })),
      }),
      el('div', { class: 'hud-scope-screen', children: [canvas, timebase] }),
    ],
  });

  return {
    node,
    update: (snapshot) => {
      if (!snapshot.availability.trace) {
        timebase.textContent = 'trace unavailable';
        return;
      }
      timebase.textContent = `${WINDOW_MS / DIVISIONS} ms/div`;
      drawScope({
        canvas,
        channels: LANES.map((lane) => ({ key: lane.key, stimulus: lane.stimulus === true })),
        pulses: bench
          .trace()
          .map((point) => ({ key: point.lane, at: point.at, durationMs: point.durationMs })),
        now: snapshot.machineMs,
        windowMs: WINDOW_MS,
        divisions: DIVISIONS,
        colours: COLOURS,
      });
    },
  };
};
