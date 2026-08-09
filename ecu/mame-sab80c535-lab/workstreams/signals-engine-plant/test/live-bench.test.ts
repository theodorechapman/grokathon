import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { advanceLiveBench } from '../src/advance-live-bench.ts';
import type { RuntimeBridgeTypes } from '../src/runtime-bridge-types.ts';
import { runtimeScenarios } from '../src/runtime-scenarios.ts';
import { validateRuntimeBridgeCommand } from '../src/validate-runtime-bridge-command.ts';

type Frame = Extract<RuntimeBridgeTypes['response'], { type: 'frame' }>;

const frame = (seq: number, fromCycle: number, toCycle: number): Frame => ({
  schema: 'motronic-bridge/v1',
  type: 'frame',
  seq,
  fromCycle,
  toCycle,
  cycle: toCycle,
  counters: {
    instructions: 1,
    init: 1,
    supervisor: 0,
    foreground: 0,
    timer0: 0,
    timer1: 0,
    timer2: 0,
    capture: 0,
    vector0063: 0,
    vector006b: 0,
    unknownXdataReads: 0,
  },
  telemetry: [{ cycle: toCycle - 1, kind: 'sfr-write', address: 0xc4, value: 1 }],
});

describe('live bench composition', () => {
  it('builds strict bridge batches from plant and adaptive crank state', () => {
    let state: ReturnType<typeof advanceLiveBench>['state'] | null = null;
    let previous: Frame | null = frame(0, 0, 1);
    let sawCrank = false;
    for (let step = 0; step < 80; step += 1) {
      const fromCycle = step * 10_000;
      const toCycle = fromCycle + 10_000;
      const result = advanceLiveBench(
        state,
        {
          pedalPermille: 500,
          brakePermille: 0,
          starterEngaged: step < 30,
          dropCrank: false,
          adcFault: null,
        },
        previous,
        fromCycle,
        toCycle,
      );
      state = result.state;
      sawCrank ||= result.events.some((event) => event.kind === 'cc0');
      validateRuntimeBridgeCommand(
        {
          schema: 'motronic-bridge/v1',
          type: 'advance',
          seq: step,
          fromCycle,
          toCycle,
          events: result.events,
        },
        { expectedSeq: step, expectedFromCycle: fromCycle },
      );
      previous = frame(step + 1, fromCycle, toCycle);
    }
    assert.ok(state !== null && state.plant.rpmMilli > 0);
    assert.ok(sawCrank);
  });

  it('suppresses crank transitions during dropout and applies ADC faults', () => {
    const first = advanceLiveBench(
      null,
      {
        pedalPermille: 100,
        brakePermille: 0,
        starterEngaged: true,
        dropCrank: true,
        adcFault: { channel: 0, callbackCode: 127 },
      },
      frame(0, 0, 1),
      0,
      10_000,
    );
    assert.equal(first.events.some((event) => event.kind === 'cc0'), false);
    assert.ok(
      first.events.some(
        (event) => event.kind === 'adc' && event.channel === 0 && event.value === 127,
      ),
    );
  });

  it('holds sparse injector schedule observations for a disclosed interval', () => {
    let state: ReturnType<typeof advanceLiveBench>['state'] | null = null;
    let previous = frame(0, 0, 1);
    for (let step = 0; step < 51; step += 1) {
      const fromCycle = step * 10_000;
      const result = advanceLiveBench(
        state,
        {
          pedalPermille: 100,
          brakePermille: 0,
          starterEngaged: step === 0,
          dropCrank: false,
          adcFault: null,
        },
        previous,
        fromCycle,
        fromCycle + 10_000,
      );
      state = result.state;
      previous = { ...frame(step + 1, fromCycle, fromCycle + 10_000), telemetry: [] };
    }
    assert.equal(state?.injectorScheduleHoldSteps, 0);
    assert.equal(state?.plant.injectorScheduleFeedback, 'inactive');
  });

  it('defines every requested deterministic scenario exactly once', () => {
    assert.deepEqual(
      runtimeScenarios.map((item) => item.id),
      [
        'acceleration',
        'warm-idle',
        'wide-open-throttle',
        'limiter',
        'overrun',
        'stall',
        'dropout',
        'sensor-fault',
      ],
    );
  });
});
