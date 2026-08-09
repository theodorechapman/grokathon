import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { assertValidScenario } from '../src/assert-valid-scenario.ts';
import { generateSuite } from '../src/generate-suite.ts';

describe('signal contract', () => {
  it('carries an explicit timebase and quantization policy', () => {
    const scenario = generateSuite().scenarios[0]!;
    assert.deepEqual(scenario.timebase, {
      ticksPerSecond: 10_000,
      unit: 'bench-tick',
      sampleEveryTicks: 100,
      interpolation: 'linear-then-nearest',
      byteQuantization: 'nearest-ties-up-saturate-u8',
    });
  });

  it('keeps board input status separate from output hooks', () => {
    const scenario = generateSuite().scenarios[0]!;
    assert.deepEqual(scenario.frames[0]!.boardStatus, {
      a040: 0,
      a041: 0,
      a081: 0,
    });
    assert.ok(
      scenario.oracleHooks.some(
        (hook) => hook.source === 'xdata-write' && hook.id === 'discrete-output-write',
      ),
    );
  });

  it('rejects out-of-range bytes', () => {
    const scenario = structuredClone(generateSuite().scenarios[0]!);
    scenario.frames[0]!.adc[0] = 256;
    assert.throws(() => assertValidScenario(scenario), /unsigned byte/);
  });

  it('rejects non-monotonic event time', () => {
    const scenario = structuredClone(
      generateSuite().scenarios.find((candidate) => candidate.id === 'cold-crank')!,
    );
    scenario.crankEdges[1]!.tick = scenario.crankEdges[0]!.tick;
    assert.throws(() => assertValidScenario(scenario), /must increase/);
  });
});
