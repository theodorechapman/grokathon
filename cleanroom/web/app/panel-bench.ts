/**
 * The bench panel: controls on the left, graded readouts on the right.
 *
 * Every control writes into the real controller — the throttle moves the AFM
 * channel, the button runs `powerOn()`. Nothing is faked forward.
 */

import { el } from './dom.ts';
import { createMarginNote } from './margin-note.ts';
import { BENCH_READOUTS, type Readout } from './readouts.ts';
import type { Bench } from './bench.ts';
import type { Panel } from './panel.ts';

interface Scenario {
  name: string;
  throttle: number;
  brake: number;
  hint: string;
}

const SCENARIOS: readonly Scenario[] = [
  {
    name: 'idle',
    throttle: 0,
    brake: 0,
    hint: 'Foot off the pedal. The controller holds the engine at its idle target on its own.',
  },
  {
    name: 'part load',
    throttle: 0.3,
    brake: 0.25,
    hint: 'Light throttle against the brake — cruising. Watch the load byte settle in the middle.',
  },
  {
    name: 'wide open',
    throttle: 1,
    brake: 0.12,
    hint: 'Full throttle with enough load to stay just under the limit. The richest mixture it commands.',
  },
  {
    name: 'over-rev',
    throttle: 1,
    brake: 0,
    hint: 'Full throttle, nothing holding it back. It hits the limiter and bounces: fuel off, speed falls, fuel on.',
  },
];

const slider = (
  label: string,
  initial: number,
  onInput: (value: number) => void,
): { node: HTMLElement; input: HTMLInputElement; readout: HTMLElement } => {
  const input = el('input', {
    class: 'slider',
    attrs: { type: 'range', min: '0', max: '100', value: String(Math.round(initial * 100)) },
  });
  const readout = el('span', { class: 'slider-value', text: `${Math.round(initial * 100)}%` });
  input.addEventListener('input', () => {
    const value = Number(input.value) / 100;
    readout.textContent = `${input.value}%`;
    onInput(value);
  });
  const node = el('label', {
    class: 'slider-row',
    children: [
      el('span', { class: 'slider-label', text: label }),
      input,
      readout,
    ],
  });
  return { node, input, readout };
};

const readoutCell = (
  readout: Readout,
  attach: (target: HTMLElement, grade: Readout['grade'], basis: string) => void,
): { node: HTMLElement; value: HTMLElement } => {
  const value = el('span', { class: 'value', text: '—' });
  attach(value, readout.grade, readout.basis);
  const label = el('span', { class: 'readout-label', text: readout.label });
  const caption =
    readout.caption === undefined
      ? []
      : [el('span', { class: 'readout-caption', text: readout.caption })];
  const node = el('div', {
    class: `readout readout-${readout.group}`,
    children: [label, ...caption, value],
  });
  return { node, value };
};

export const createBenchPanel = (bench: Bench): Panel => {
  const canControl = (): boolean => {
    const provenance = bench.provenance();
    return provenance.mode !== 'evidence' && provenance.controls === 'read-write';
  };
  const note = createMarginNote(
    'Point at any value to see what it rests on. Red means the number is not proven by the binary.',
  );

  const power = el('button', { class: 'power', text: 'start engine' });
  const throttle = slider('throttle', bench.throttle(), (value) => bench.setThrottle(value));
  const brake = slider('dyno load', bench.brake(), (value) => bench.setBrake(value));

  const setScenario = (scenario: Scenario): void => {
    if (!canControl()) return;
    bench.setThrottle(scenario.throttle);
    bench.setBrake(scenario.brake);
    throttle.input.value = String(Math.round(scenario.throttle * 100));
    throttle.readout.textContent = `${throttle.input.value}%`;
    brake.input.value = String(Math.round(scenario.brake * 100));
    brake.readout.textContent = `${brake.input.value}%`;
    if (!bench.isRunning()) bench.start();
  };

  const hint = el('p', {
    class: 'scenario-hint',
    text: 'Pick a condition, or drive the sliders yourself.',
  });

  const scenarioButtons = SCENARIOS.map((scenario) => {
    const button = el('button', {
      class: 'scenario',
      text: scenario.name,
      title: scenario.hint,
      on: {
        click: () => {
          setScenario(scenario);
          for (const other of scenarioButtons) other.classList.remove('is-active');
          button.classList.add('is-active');
          hint.textContent = scenario.hint;
        },
      },
    });
    return button;
  });

  power.addEventListener('click', () => {
    if (!canControl()) return;
    if (bench.isRunning()) {
      bench.stop();
      for (const other of scenarioButtons) other.classList.remove('is-active');
    } else {
      bench.start();
    }
  });

  const cells = BENCH_READOUTS.map((readout) => ({
    readout,
    ...readoutCell(readout, note.attach),
  }));
  const inGroup = (group: Readout['group']): HTMLElement[] =>
    cells.filter((cell) => cell.readout.group === group).map((cell) => cell.node);
  const controlInputs = [power, throttle.input, brake.input, ...scenarioButtons];

  const node = el('section', {
    class: 'panel panel-bench',
    children: [
      el('header', {
        class: 'panel-head',
        children: [
          el('span', { class: 'tab', text: 'bench' }),
          el('h2', { text: 'The selected controller backend' }),
          el('p', {
            class: 'panel-note',
            text: 'The controls go to the selected backend; values on the right only appear when that backend reports them. Evidence mode is intentionally read-only.',
          }),
        ],
      }),
      el('div', {
        class: 'bench-body',
        children: [
          el('div', {
            class: 'controls',
            children: [
              power,
              el('div', { class: 'scenarios', children: scenarioButtons }),
              hint,
              throttle.node,
              brake.node,
              el('p', {
                class: 'controls-note',
                text: 'In the local demo, these controls drive the disclosed toy plant. A MAME gateway may accept them only when its supervisor declares a writable demo mode.',
              }),
            ],
          }),
          el('div', {
            class: 'readouts',
            children: [
              el('div', { class: 'primary', children: inGroup('primary') }),
              el('div', { class: 'grid', children: inGroup('secondary') }),
              el('div', {
                class: 'limiter',
                children: [
                  el('h3', {
                    children: [
                      el('span', { text: 'The rev limiter' }),
                      el('span', {
                        class: 'limiter-caption',
                        text: 'one byte in the ROM, three inferences, and a bit that flips',
                      }),
                    ],
                  }),
                  el('div', { class: 'grid', children: inGroup('limiter') }),
                ],
              }),
              note.node,
            ],
          }),
        ],
      }),
    ],
  });

  return {
    node,
    update: (snapshot) => {
      const readOnly = !canControl();
      for (const control of controlInputs) control.disabled = readOnly;
      power.textContent = bench.isRunning() ? 'stop' : 'start engine';
      power.classList.toggle('is-running', bench.isRunning());
      node.classList.toggle(
        'is-cutting',
        snapshot.availability.readouts && snapshot.limiter.cutStageActive,
      );
      for (const cell of cells) {
        const text = snapshot.availability.readouts
          ? cell.readout.read(snapshot)
          : 'unavailable';
        if (cell.value.textContent !== text) cell.value.textContent = text;
      }
    },
  };
};
