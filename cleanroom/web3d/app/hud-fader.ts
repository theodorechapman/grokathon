/**
 * Vertical console fader: a custom slider (div track + thumb) so the demo
 * script can glide it and the styling matches the instrument panel on every
 * browser. Pointer drag, arrow/page keys, and ARIA slider semantics.
 */

import { el } from '../../web/app/dom.ts';

export interface Fader {
  node: HTMLElement;
  /** Move the lever without firing onInput — used by the attract script. */
  set(value: number): void;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export const createFader = (
  label: string,
  initial: number,
  onInput: (value: number) => void,
): Fader => {
  const fill = el('div', { class: 'hud-fader-fill' });
  const thumb = el('div', { class: 'hud-fader-thumb' });
  const readout = el('span', { class: 'hud-fader-value' });
  const track = el('div', {
    class: 'hud-fader-track',
    attrs: {
      role: 'slider',
      tabindex: '0',
      'aria-label': label,
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      'aria-orientation': 'vertical',
    },
    children: [fill, thumb],
  });

  let value = clamp01(initial);

  const paint = (): void => {
    const pct = Math.round(value * 100);
    fill.style.height = `${pct}%`;
    thumb.style.bottom = `${pct}%`;
    readout.textContent = `${pct}`;
    track.setAttribute('aria-valuenow', String(pct));
  };

  const input = (next: number): void => {
    value = clamp01(next);
    paint();
    onInput(value);
  };

  const valueFromPointer = (event: PointerEvent): number => {
    const rect = track.getBoundingClientRect();
    return clamp01(1 - (event.clientY - rect.top) / rect.height);
  };

  track.addEventListener('pointerdown', (event) => {
    track.setPointerCapture(event.pointerId);
    input(valueFromPointer(event));
  });
  track.addEventListener('pointermove', (event) => {
    if (track.hasPointerCapture(event.pointerId)) input(valueFromPointer(event));
  });
  track.addEventListener('keydown', (event) => {
    const step =
      event.key === 'ArrowUp' ? 0.02
      : event.key === 'ArrowDown' ? -0.02
      : event.key === 'PageUp' ? 0.1
      : event.key === 'PageDown' ? -0.1
      : null;
    if (step === null) return;
    event.preventDefault();
    input(value + step);
  });

  paint();
  return {
    node: el('div', {
      class: 'hud-fader',
      children: [readout, track, el('span', { class: 'hud-fader-label', text: label })],
    }),
    set: (next) => {
      value = clamp01(next);
      paint();
    },
  };
};
