/**
 * The masthead: the part number, the reset trace, and the integrity check.
 *
 * The number across the top is read out of the ROM image the model verifies,
 * through the same `readIdentity` the diagnostic service uses — not typed in.
 */

import type { BenchIdentity } from './bench.ts';
import { el } from './dom.ts';
import type { Bench } from './bench.ts';
import type { Panel } from './panel.ts';

const hex4 = (value: number): string => value.toString(16).padStart(4, '0');

/** The key to the whole page, in the three inks it uses. */
const KEY: ReadonlyArray<{ grade: string; sample: string; meaning: string }> = [
  { grade: 'proven', sample: '0x90', meaning: 'black: the ROM settles it, byte for byte' },
  { grade: 'assumed', sample: '6336.8 rpm', meaning: 'dashed: a scale nobody could establish' },
  { grade: 'model', sample: 'part-load', meaning: 'dotted: a mechanism this model chose' },
];

const legend = (): HTMLElement =>
  el('div', {
    class: 'legend',
    children: KEY.map((entry) =>
      el('div', {
        class: 'legend-item',
        children: [
          el('span', {
            class: 'legend-sample',
            text: entry.sample,
            attrs: { 'data-grade': entry.grade },
          }),
          el('span', { class: 'legend-meaning', text: entry.meaning }),
        ],
      }),
    ),
  });

const statLine = (label: string): { node: HTMLElement; value: HTMLElement } => {
  const value = el('span', { class: 'stat-value', text: '—' });
  return {
    value,
    node: el('div', {
      class: 'stat',
      children: [el('span', { class: 'stat-label', text: label }), value],
    }),
  };
};

export const createHeaderPanel = (bench: Bench): Panel => {
  const uptime = statLine('time since power-on');
  const cycles = statLine('control loops run');
  const captures = statLine('crank pulses handled');
  const faults = statLine('faults stored');
  const eyebrow = el('p', { class: 'eyebrow' });
  const partDigits = el('span', { class: 'part-digits' });
  const partCaption = el('span', { class: 'part-caption' });
  const checksumValue = el('span', { class: 'stat-value' });
  const resetTrace = el('div', { class: 'reset-trace' });
  let shownIdentity: BenchIdentity | null = null;

  const renderIdentity = (): void => {
    const identity = bench.identity();
    if (identity === shownIdentity) return;
    shownIdentity = identity;
    eyebrow.textContent = `${identity.backend} backend · ${identity.controller} · ${identity.processor}`;
    partDigits.textContent = identity.bosch ?? 'identity unavailable';
    partCaption.textContent =
      identity.software === null
        ? 'software identity unavailable'
        : `identity ${identity.bosch ?? 'unavailable'} · software ${identity.software}`;
    checksumValue.textContent =
      identity.checksum === null
        ? 'unavailable'
        : `sum(0000..9eff) = ${hex4(identity.checksum.computed)} ${
            identity.checksum.passed ? '✓' : '✗'
          }`;
    const trace =
      identity.resetTrace === null
        ? [el('span', { class: 'trace-caption', text: 'reset trace unavailable' })]
        : identity.resetTrace.flatMap((address, index) => {
            const chip = el('span', {
              class: 'trace-step',
              text: hex4(address),
              attrs: { style: `--step:${index}` },
            });
            return index === 0
              ? [chip]
              : [el('span', { class: 'trace-arrow', text: '›' }), chip];
          });
    resetTrace.replaceChildren(el('span', { class: 'trace-label', text: 'reset' }), ...trace);
  };
  renderIdentity();

  const node = el('header', {
    class: 'masthead',
    children: [
      eyebrow,
      el('h1', {
        class: 'part-number',
        children: [partDigits, partCaption],
      }),
      el('div', {
        class: 'lead',
        children: [
          el('p', {
            text: 'This page can run the local clean-room demonstration or read a native gateway connected to MAME. The selected backend supplies its own identity, qualification, and live state.',
          }),
          el('p', {
            text: 'Unavailable MAME observations stay unavailable; the browser does not fill them from the clean-room model. Evidence mode also locks controls and assumptions.',
          }),
        ],
      }),
      legend(),
      resetTrace,
      el('div', {
        class: 'masthead-stats',
        children: [
          el('div', {
            class: 'stat stat-checksum',
            children: [
              el('span', { class: 'stat-label', text: 'ROM checksum' }),
              checksumValue,
            ],
          }),
          uptime.node,
          cycles.node,
          captures.node,
          faults.node,
        ],
      }),
    ],
  });

  return {
    node,
    update: (snapshot) => {
      renderIdentity();
      if (!snapshot.availability.runtime) {
        for (const stat of [uptime, cycles, captures, faults]) {
          stat.value.textContent = 'unavailable';
        }
        return;
      }
      uptime.value.textContent = `${(snapshot.machineMs / 1000).toFixed(2)} s`;
      cycles.value.textContent = snapshot.foregroundCycles.toLocaleString('en-US');
      captures.value.textContent = snapshot.captureInterrupts.toLocaleString('en-US');
      faults.value.textContent = String(snapshot.faultCount);
    },
  };
};
