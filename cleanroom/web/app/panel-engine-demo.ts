/**
 * Show demo: live cutaway engine, throttle, and a few big gauges.
 * No evidence grades, no memory dump, no margin notes.
 */

import type { Bench } from './bench.ts';
import { el } from './dom.ts';
import { createEngineView } from './engine-view.ts';
import type { Panel } from './panel.ts';

interface Scenario {
  name: string;
  throttle: number;
  brake: number;
}

const SCENARIOS: readonly Scenario[] = [
  { name: 'idle', throttle: 0, brake: 0 },
  { name: 'cruise', throttle: 0.28, brake: 0.22 },
  { name: 'pull', throttle: 1, brake: 0.1 },
  { name: 'redline', throttle: 1, brake: 0 },
];

const slider = (
  label: string,
  initial: number,
  onInput: (value: number) => void,
): { node: HTMLElement; input: HTMLInputElement; value: HTMLElement } => {
  const input = el('input', {
    class: 'demo-slider',
    attrs: { type: 'range', min: '0', max: '100', value: String(Math.round(initial * 100)) },
  });
  const value = el('span', { class: 'demo-slider-value', text: `${Math.round(initial * 100)}%` });
  input.addEventListener('input', () => {
    const next = Number(input.value) / 100;
    value.textContent = `${input.value}%`;
    onInput(next);
  });
  return {
    input,
    value,
    node: el('label', {
      class: 'demo-slider-row',
      children: [el('span', { class: 'demo-slider-label', text: label }), input, value],
    }),
  };
};

const gauge = (label: string): { node: HTMLElement; value: HTMLElement } => {
  const value = el('div', { class: 'gauge-value', text: '—' });
  return {
    value,
    node: el('div', {
      class: 'gauge',
      children: [el('div', { class: 'gauge-label', text: label }), value],
    }),
  };
};

export const createEngineDemoPanel = (bench: Bench): Panel => {
  const view = createEngineView();
  const power = el('button', { class: 'demo-power', text: 'start' });
  const throttle = slider('throttle', bench.throttle(), (v) => bench.setThrottle(v));
  const brake = slider('load', bench.brake(), (v) => bench.setBrake(v));
  const rpmGauge = gauge('rpm');
  const modeGauge = gauge('mode');
  const fuelGauge = gauge('pulse');
  const sparkGauge = gauge('advance');
  const loadGauge = gauge('load');
  const cutBadge = el('div', { class: 'cut-badge', text: 'REV CUT' });
  cutBadge.hidden = true;

  let lastNow = performance.now();

  const applyScenario = (scenario: Scenario): void => {
    bench.setThrottle(scenario.throttle);
    bench.setBrake(scenario.brake);
    throttle.input.value = String(Math.round(scenario.throttle * 100));
    throttle.value.textContent = `${throttle.input.value}%`;
    brake.input.value = String(Math.round(scenario.brake * 100));
    brake.value.textContent = `${brake.input.value}%`;
    if (!bench.isRunning()) bench.start();
  };

  const scenarioButtons = SCENARIOS.map((scenario) =>
    el('button', {
      class: 'demo-scenario',
      text: scenario.name,
      on: {
        click: () => {
          applyScenario(scenario);
          for (const other of scenarioButtons) other.classList.remove('is-active');
          scenarioButtons[SCENARIOS.indexOf(scenario)].classList.add('is-active');
        },
      },
    }),
  );

  power.addEventListener('click', () => {
    if (bench.isRunning()) {
      bench.stop();
      for (const button of scenarioButtons) button.classList.remove('is-active');
    } else {
      bench.start();
    }
  });

  const stage = el('div', { class: 'engine-stage', children: [view.node, cutBadge] });
  const resize = (): void => {
    const rect = stage.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    view.setSize(rect.width, rect.height);
  };
  const ro = new ResizeObserver(() => resize());
  ro.observe(stage);
  window.addEventListener('resize', resize);

  const node = el('section', {
    class: 'engine-demo',
    children: [
      el('header', {
        class: 'demo-head',
        children: [
          el('p', { class: 'demo-eyebrow', text: 'Motronic 1.7  ·  live plant' }),
          el('h1', { text: 'Engine demo' }),
        ],
      }),
      el('div', {
        class: 'demo-layout',
        children: [
          el('aside', {
            class: 'demo-controls',
            children: [
              power,
              el('div', { class: 'demo-scenarios', children: scenarioButtons }),
              throttle.node,
              brake.node,
              el('p', {
                class: 'demo-blurb',
                text: 'Throttle and load drive a toy plant into the clean-room controller. The cutaway is slowed so the four-stroke cycle stays readable.',
              }),
            ],
          }),
          stage,
          el('div', {
            class: 'demo-gauges',
            children: [rpmGauge.node, modeGauge.node, fuelGauge.node, sparkGauge.node, loadGauge.node],
          }),
        ],
      }),
    ],
  });

  // Size after mount so getBoundingClientRect is real.
  queueMicrotask(resize);

  return {
    node,
    update: (snapshot) => {
      const now = performance.now();
      const seconds = (now - lastNow) / 1000;
      lastNow = now;

      const running = bench.isRunning();
      const rpm = bench.rpm();
      const fuelled =
        snapshot.fuel !== null && !snapshot.fuel.cut && snapshot.fuel.pulseCount > 0;
      const cutting = snapshot.limiter.cutStageActive;

      power.textContent = running ? 'stop' : 'start';
      power.classList.toggle('is-running', running);
      node.classList.toggle('is-cutting', cutting);
      cutBadge.hidden = !cutting;

      rpmGauge.value.textContent = running ? String(Math.round(rpm)) : '0';
      modeGauge.value.textContent = snapshot.availability.readouts ? snapshot.mode : '—';
      fuelGauge.value.textContent =
        snapshot.fuel === null
          ? '—'
          : snapshot.fuel.cut
            ? 'cut'
            : `${snapshot.fuel.pulseWidthMs.toFixed(2)} ms`;
      sparkGauge.value.textContent =
        snapshot.ignition === null ? '—' : `${snapshot.ignition.advanceDegBtdc.toFixed(1)}°`;
      loadGauge.value.textContent = snapshot.availability.readouts
        ? `0x${snapshot.normalizedLoad.toString(16).padStart(2, '0')}`
        : '—';

      view.draw(
        {
          rpm,
          running,
          throttle: bench.throttle(),
          fuelled,
          cutting,
        },
        seconds,
      );
    },
  };
};
