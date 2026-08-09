/**
 * The timing scope: `machine.events` on a time axis.
 *
 * The capture lane is the stimulus this page feeds into external-3/CC0. Every
 * other lane is an output the model actually emitted — a compare channel
 * crossing, or an injector pulse dispatched by the fuel path. Channels are
 * named the way the model names them, because SPECS does not recover which
 * compare channel or port bit reaches which coil or injector bank.
 */

import { el } from './dom.ts';
import { createMarginNote } from './margin-note.ts';
import { drawScope } from './scope-trace.ts';
import type { Bench, TraceLane } from './bench.ts';
import type { Panel } from './panel.ts';

const WINDOW_MS = 30;
const DIVISIONS = 10;

interface Lane {
  lane: TraceLane;
  label: string;
  basis: string;
  grade: 'proven' | 'assumed' | 'model';
}

const LANES: readonly Lane[] = [
  {
    lane: 'capture',
    label: 'a crank tooth passes',
    grade: 'model',
    basis:
      'The input, not an output. Production tooth geometry is unknown: the local clean-room backend assumes 60 uniform events, while the current MAME demo discloses a synthetic 12-position/one-gap fixture.',
  },
  {
    lane: 'ignition-charge',
    label: 'coil-charge model event',
    grade: 'model',
    basis:
      'A local clean-room scheduling event. It is not MAME pin telemetry and must not be read as a recovered compare-channel assignment.',
  },
  {
    lane: 'p15-ignition',
    label: 'P1.5 logical ignition',
    grade: 'proven',
    basis:
      'Canonical firmware evidence identifies Timer 0 / P1.5 as logical ignition. A trace is shown only when the selected backend reports an event; physical coil and cylinder routing remain unresolved.',
  },
  {
    lane: 'cc2-cc3-schedule',
    label: 'CC2 / CC3 injector schedules',
    grade: 'proven',
    basis:
      'Canonical firmware evidence identifies CC2/P1.2 and CC3/P1.3 as logical injector schedules. Exact compare-pin waveforms and physical bank routing are not yet established.',
  },
  {
    lane: 'idle-actuator',
    label: 'idle valve adjusted',
    grade: 'model',
    basis:
      'The controller nudging the air valve that holds idle speed. Only active when it thinks it is idling. Which pin carries this signal is unresolved, so none is claimed.',
  },
];

const readColour = (name: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export const createScopePanel = (bench: Bench): Panel => {
  const note = createMarginNote(
    'What the controller is doing to its outputs, as a bench scope would show it: time runs left to right, and a line steps up while that output is on. Point at a channel name for what it is.',
  );
  const canvas = el('canvas', { class: 'scope-canvas' });
  const timebase = el('span', {
    class: 'timebase',
    text: `${WINDOW_MS / DIVISIONS} ms / div · ${WINDOW_MS} ms window`,
  });
  const labels = LANES.map((lane) => {
    const count = el('span', { class: 'lane-count', text: '0' });
    const label = el('span', { class: 'lane-label', text: lane.label });
    note.attach(label, lane.grade, lane.basis);
    return { lane, count, node: el('div', { class: 'lane-row', children: [label, count] }) };
  });

  const node = el('section', {
    class: 'panel panel-scope',
    children: [
      el('header', {
        class: 'panel-head',
        children: [
          el('span', { class: 'tab', text: 'scope' }),
          el('h2', { text: 'Sparks and squirts, as they happen' }),
          timebase,
        ],
      }),
      el('div', {
        class: 'scope-body',
        children: [
          el('div', { class: 'lane-legend', children: labels.map((entry) => entry.node) }),
          el('div', { class: 'scope-screen', children: [canvas] }),
        ],
      }),
      note.node,
    ],
  });

  const draw = (now: number): void => {
    const counts = drawScope({
      canvas,
      channels: LANES.map((lane) => ({ key: lane.lane, stimulus: lane.lane === 'capture' })),
      pulses: bench
        .trace()
        .map((point) => ({ key: point.lane, at: point.at, durationMs: point.durationMs })),
      now,
      windowMs: WINDOW_MS,
      divisions: DIVISIONS,
      colours: {
        screen: readColour('--screen'),
        graticule: readColour('--graticule'),
        trace: readColour('--trace'),
        stimulus: readColour('--pen-bright'),
      },
    });

    for (const entry of labels) {
      const value = String(counts.get(entry.lane.lane) ?? 0);
      if (entry.count.textContent !== value) entry.count.textContent = value;
    }
  };

  return {
    node,
    update: (snapshot) => {
      if (!snapshot.availability.trace) {
        timebase.textContent = 'trace unavailable';
        for (const entry of labels) entry.count.textContent = 'unavailable';
        return;
      }
      timebase.textContent = `${WINDOW_MS / DIVISIONS} ms / div · ${WINDOW_MS} ms window`;
      draw(snapshot.machineMs);
    },
  };
};
