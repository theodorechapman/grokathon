interface RuntimeScenarioInput {
  pedalPermille: number;
  brakePermille: number;
  starterEngaged: boolean;
  dropCrank: boolean;
  adcFault: { channel: number; callbackCode: number } | null;
}

interface RuntimeScenario {
  id:
    | 'acceleration'
    | 'warm-idle'
    | 'wide-open-throttle'
    | 'limiter'
    | 'overrun'
    | 'stall'
    | 'dropout'
    | 'sensor-fault';
  steps: number;
  inputAt(step: number): RuntimeScenarioInput;
}

const input = (
  step: number,
  pedalPermille: number,
  options: Partial<RuntimeScenarioInput> = {},
): RuntimeScenarioInput => ({
  pedalPermille,
  brakePermille: 0,
  starterEngaged: step < 120,
  dropCrank: false,
  adcFault: null,
  ...options,
});

const scenario = (
  id: RuntimeScenario['id'],
  steps: number,
  inputAt: RuntimeScenario['inputAt'],
): RuntimeScenario => ({ id, steps, inputAt });

export const runtimeScenarios: ReadonlyArray<RuntimeScenario> = [
  scenario('acceleration', 240, (step) =>
    input(step, step < 80 ? 80 : Math.min(700, 80 + (step - 80) * 6))),
  scenario('warm-idle', 300, (step) => input(step, 90)),
  scenario('wide-open-throttle', 300, (step) => input(step, step < 130 ? 100 : 1_000)),
  scenario('limiter', 600, (step) => input(step, step < 130 ? 100 : 1_000)),
  scenario('overrun', 360, (step) => input(step, step < 220 ? 650 : 0)),
  scenario('stall', 320, (step) =>
    input(step, step < 170 ? 120 : 0, {
      brakePermille: step < 170 ? 0 : 1_000,
      starterEngaged: step < 100,
    })),
  scenario('dropout', 360, (step) =>
    input(step, 120, { dropCrank: step >= 190 && step < 240 })),
  scenario('sensor-fault', 320, (step) =>
    input(step, 120, {
      adcFault: step >= 180 ? { channel: 0, callbackCode: 127 } : null,
    })),
];
