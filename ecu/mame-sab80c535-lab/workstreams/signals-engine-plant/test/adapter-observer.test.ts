import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { adaptAccuracyXdata } from '../src/adapt-accuracy-xdata.ts';
import { generateSuite } from '../src/generate-suite.ts';
import { observeOutputs } from '../src/observe-outputs.ts';
import { serializePlan } from '../src/serialize-plan.ts';
import type { TraceEvent } from '../src/signal-contract.ts';

const keyOn = () =>
  generateSuite().scenarios.find((scenario) => scenario.id === 'key-on')!;

describe('accuracy-xdata adapter', () => {
  it('emits synchronized delta events and bootstrap inputs', () => {
    const plan = adaptAccuracyXdata(keyOn());
    assert.equal(plan.initialEnvironment.MOTRONIC_INPUTS, 'a040=00,a041=00,a081=00');
    assert.equal(plan.events.filter((event) => event.tick === 0).length, 14);
    assert.ok(plan.events.some((event) => event.kind === 'uart-byte' && event.value === 0x06));
    for (let index = 1; index < plan.events.length; index += 1) {
      assert.ok(plan.events[index - 1]!.tick <= plan.events[index]!.tick);
    }
  });

  it('serializes a stable versioned NDJSON plan', () => {
    const plan = adaptAccuracyXdata(keyOn());
    const first = serializePlan(plan);
    assert.equal(first, serializePlan(plan));
    assert.deepEqual(JSON.parse(first.split('\n')[0]!), {
      schema: 'accuracy-xdata-signal-plan/v1',
      scenarioId: 'key-on',
      seed: 0x10010001,
      ticksPerSecond: 10_000,
    });
  });
});

describe('logical output observations', () => {
  it('collects activity without assigning physical units', () => {
    const trace: TraceEvent[] = [
      { tick: 1, kind: 'p1', value: 0xff },
      { tick: 2, kind: 'p1', value: 0xdf },
      { tick: 3, kind: 'p1', value: 0x5f },
      { tick: 4, kind: 'sfr-write', address: 0xc4, value: 0x12 },
      { tick: 5, kind: 'xdata-write', address: 0xa040, value: 0x21 },
      { tick: 6, kind: 'xdata-write', address: 0x0301, value: 0x40 },
      { tick: 7, kind: 'pc', address: 0x908d },
      { tick: 8, kind: 'pc', address: 0x601a },
    ];
    const report = observeOutputs(keyOn(), trace);
    const counts = Object.fromEntries(report.hooks.map((hook) => [hook.id, hook.count]));
    assert.equal(counts['ignition-command'], 1);
    assert.equal(counts['iac-command'], 1);
    assert.equal(counts['compare-2-schedule'], 1);
    assert.equal(counts['discrete-output-write'], 1);
    assert.equal(counts['fault-state'], 1);
    assert.equal(counts['supervisor-progress'], 1);
    assert.equal(counts['cyclic-progress'], 1);
  });

  it('rejects traces whose ticks run backward', () => {
    const trace: TraceEvent[] = [
      { tick: 2, kind: 'pc', address: 0x908d },
      { tick: 1, kind: 'pc', address: 0x601a },
    ];
    assert.throws(() => observeOutputs(keyOn(), trace), /nondecreasing/);
  });
});
