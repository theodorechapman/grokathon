import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { assertValidScenario } from '../src/assert-valid-scenario.ts';
import { generateScenario } from '../src/generate-scenario.ts';
import { generateSuite } from '../src/generate-suite.ts';
import { scenarioSpecs } from '../src/scenario-specs.ts';

describe('deterministic signal generation', () => {
  it('covers every requested operating fixture', () => {
    const ids = generateSuite().scenarios.map((scenario) => scenario.id);
    assert.deepEqual(ids, [
      'key-on',
      'cold-crank',
      'warm-idle',
      'part-load-ramp',
      'wide-open-throttle',
      'overrun',
      'stall',
      'sensor-ch1-high',
      'sensor-ch2-low',
      'sensor-ch0-stuck-high',
    ]);
  });

  it('replays the same seed byte-for-byte', () => {
    const spec = scenarioSpecs.find((candidate) => candidate.id === 'warm-idle')!;
    const first = JSON.stringify(generateScenario(spec));
    const second = JSON.stringify(generateScenario(spec));
    assert.equal(first, second);
  });

  it('uses the seed for deterministic ADC dither', () => {
    const spec = scenarioSpecs.find((candidate) => candidate.id === 'part-load-ramp')!;
    const first = generateScenario(spec, 1);
    const second = generateScenario(spec, 2);
    assert.notDeepEqual(first.frames, second.frames);
    assert.deepEqual(first.crankEdges, second.crankEdges);
  });

  it('stops crank edges at the stall keyframe', () => {
    const scenario = generateSuite().scenarios.find((candidate) => candidate.id === 'stall')!;
    assert.ok(scenario.crankEdges.length > 0);
    assert.ok(scenario.crankEdges.every((edge) => edge.tick < 3600));
  });

  it('keeps selected fault bytes exact and provenance explicit', () => {
    const suite = generateSuite();
    const high = suite.scenarios.find((candidate) => candidate.id === 'sensor-ch1-high')!;
    const low = suite.scenarios.find((candidate) => candidate.id === 'sensor-ch2-low')!;
    assert.ok(high.frames.every((frame) => frame.adc[1] === 0xff));
    assert.ok(low.frames.every((frame) => frame.adc[2] === 0x00));
    assert.ok(high.assumptions.some((item) => item.id === 'sensor-extreme-fixtures'));
  });

  it('validates every generated contract', () => {
    for (const scenario of generateSuite().scenarios) {
      assert.doesNotThrow(() => assertValidScenario(scenario));
    }
  });
});
