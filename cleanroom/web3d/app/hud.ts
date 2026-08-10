/**
 * Operator console over the 3D bay: power/auto keys, scenario presets, two
 * vertical faders, and an instrument stack with RPM as the hero readout.
 * The attract script moves the faders through `syncLevers`; any manual touch
 * reports through `hooks.onManual` so the script lets go.
 */

import type { Bench, Snapshot } from '../../web/app/bench.ts';
import { el } from '../../web/app/dom.ts';
import { createFader } from './hud-fader.ts';
import { createHudScope } from './hud-scope.ts';

export interface HudHooks {
  /** A human moved a control; the attract script should release. */
  onManual(): void;
  /** AUTO key pressed. */
  onAutoToggle(): void;
}

export interface Hud {
  node: HTMLElement;
  update(snapshot: Snapshot): void;
  /** Reflect script-driven lever positions without firing input events. */
  syncLevers(throttle: number, brake: number): void;
  setAuto(active: boolean): void;
}

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

const RPM_SPAN = 7000;

const row = (label: string): { node: HTMLElement; value: HTMLElement } => {
  const value = el('span', { class: 'hud-row-value', text: '—' });
  return {
    value,
    node: el('div', {
      class: 'hud-row',
      children: [el('span', { class: 'hud-row-label', text: label }), value],
    }),
  };
};

export const createHud = (bench: Bench, hooks: HudHooks): Hud => {
  const power = el('button', { class: 'hud-key hud-power', text: 'start' });
  const auto = el('button', { class: 'hud-key hud-auto', text: 'auto' });

  const throttle = createFader('throttle', bench.throttle(), (v) => {
    hooks.onManual();
    bench.setThrottle(v);
  });
  const load = createFader('load', bench.brake(), (v) => {
    hooks.onManual();
    bench.setBrake(v);
  });

  const scenarioButtons = SCENARIOS.map((scenario) =>
    el('button', {
      class: 'hud-scenario',
      text: scenario.name,
      on: {
        click: () => {
          hooks.onManual();
          bench.setThrottle(scenario.throttle);
          bench.setBrake(scenario.brake);
          throttle.set(scenario.throttle);
          load.set(scenario.brake);
          if (!bench.isRunning()) bench.start();
          for (const other of scenarioButtons) other.classList.remove('is-active');
          scenarioButtons[SCENARIOS.indexOf(scenario)].classList.add('is-active');
        },
      },
    }),
  );
  const clearScenarios = (): void => {
    for (const button of scenarioButtons) button.classList.remove('is-active');
  };

  power.addEventListener('click', () => {
    hooks.onManual();
    if (bench.isRunning()) {
      bench.stop();
      clearScenarios();
    } else {
      bench.start();
    }
  });
  auto.addEventListener('click', () => hooks.onAutoToggle());

  const rpmValue = el('div', { class: 'hud-rpm-value', text: '0' });
  const rpmFill = el('div', { class: 'hud-rpm-fill' });
  const mode = row('mode');
  const pulse = row('pulse');
  const advance = row('advance');
  const loadRow = row('load');
  const cutLamp = el('div', { class: 'hud-cut-lamp', text: 'REV CUT' });
  cutLamp.hidden = true;
  const scope = createHudScope(bench);

  const node = el('div', {
    class: 'hud',
    children: [
      el('header', { class: 'hud-title', children: [el('h1', { text: 'Engine bay' })] }),
      cutLamp,
      el('section', {
        class: 'hud-console',
        children: [
          el('div', { class: 'hud-keys', children: [power, auto] }),
          el('div', { class: 'hud-scenarios', children: scenarioButtons }),
          el('div', { class: 'hud-faders', children: [throttle.node, load.node] }),
        ],
      }),
      el('section', {
        class: 'hud-instruments',
        children: [
          el('div', {
            class: 'hud-rpm',
            children: [
              el('div', { class: 'hud-row-label', text: 'rpm' }),
              rpmValue,
              el('div', { class: 'hud-rpm-bar', children: [rpmFill] }),
            ],
          }),
          mode.node,
          pulse.node,
          advance.node,
          loadRow.node,
        ],
      }),
      scope.node,
    ],
  });

  return {
    node,
    setAuto: (active) => {
      auto.classList.toggle('is-active', active);
      if (active) clearScenarios();
    },
    syncLevers: (throttleValue, brakeValue) => {
      throttle.set(throttleValue);
      load.set(brakeValue);
    },
    update: (snapshot) => {
      const running = bench.isRunning();
      const rpm = running ? bench.rpm() : 0;
      const cutting = snapshot.limiter.cutStageActive;

      power.textContent = running ? 'stop' : 'start';
      power.classList.toggle('is-running', running);
      node.classList.toggle('is-cutting', cutting);
      cutLamp.hidden = !cutting;

      rpmValue.textContent = String(Math.round(rpm));
      rpmFill.style.width = `${Math.round(Math.min(1, rpm / RPM_SPAN) * 100)}%`;
      rpmFill.classList.toggle('is-hot', rpm >= snapshot.limiter.limitRpm - 300);

      mode.value.textContent = snapshot.availability.readouts ? snapshot.mode : '—';
      pulse.value.textContent =
        snapshot.fuel === null
          ? '—'
          : snapshot.fuel.cut
            ? 'cut'
            : `${snapshot.fuel.pulseWidthMs.toFixed(2)} ms`;
      advance.value.textContent =
        snapshot.ignition === null ? '—' : `${snapshot.ignition.advanceDegBtdc.toFixed(1)}°`;
      loadRow.value.textContent = snapshot.availability.readouts
        ? `0x${snapshot.normalizedLoad.toString(16).padStart(2, '0')}`
        : '—';
      scope.update(snapshot);
    },
  };
};
