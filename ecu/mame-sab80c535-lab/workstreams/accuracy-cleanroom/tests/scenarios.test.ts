import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import type { TraceEvent } from '../src/audit-types.ts';
import { SCENARIO_NAMES, runAllScenarios } from '../src/scenarios.ts';
import { compactScenarioTrace } from '../src/trace-report.ts';

describe('deterministic fidelity scenarios', () => {
  const scenarios = runAllScenarios();
  const byName = new Map(scenarios.map((scenario) => [scenario.name, scenario]));

  it('covers every requested operating and fault case', () => {
    assert.deepEqual(scenarios.map((scenario) => scenario.name), [...SCENARIO_NAMES]);
    assert.equal(scenarios.length, 15);
  });

  it('emits MAME-compatible provenance, input, access, interrupt, and output concepts', () => {
    for (const scenario of scenarios) {
      assert.equal(scenario.events[0].kind, 'provenance', scenario.name);
      assert.equal(scenario.events[0].runtime, true, scenario.name);
      assert.ok(scenario.events.some((event) => event.kind === 'input'), scenario.name);
      assert.ok(scenario.events.some((event) => event.kind === 'access'), scenario.name);
      const cycles = scenario.events.slice(1).map((event) => event.cycles);
      assert.deepEqual(cycles, [...cycles].sort((a, b) => a - b), `${scenario.name} event order`);
    }
    assert.ok(scenarios.some((scenario) => scenario.events.some((event) => event.kind === 'interrupt')));
    assert.ok(scenarios.some((scenario) => scenario.events.some((event) => event.kind === 'service')));
    assert.ok(scenarios.some((scenario) => scenario.events.some((event) => event.kind === 'output')));
  });

  it('makes each fixture reach its intended model state without treating it as binary proof', () => {
    assert.equal((byName.get('cold-boot')?.observations.outcome as { warmStart: boolean }).warmStart, false);
    assert.equal((byName.get('warm-boot')?.observations.outcome as { warmStart: boolean }).warmStart, true);
    assert.equal(byName.get('stopped')?.observations.operatingMode, 'stopped');
    assert.equal(byName.get('cranking')?.observations.operatingMode, 'cranking');
    assert.equal(byName.get('sync')?.observations.syncLocked, true);
    assert.equal(byName.get('idle')?.observations.operatingMode, 'idle');
    assert.equal(byName.get('part-load')?.observations.operatingMode, 'part-load');
    assert.equal(byName.get('wide-open-throttle')?.observations.operatingMode, 'wide-open-throttle');
    assert.equal((byName.get('overrun')?.observations.overrun as { active: boolean }).active, true);
    assert.equal((byName.get('rev-limit')?.observations.limiter as { cutStageActive: boolean }).cutStageActive, true);
    assert.ok(Number(byName.get('timer-rollover')?.observations.timer2Epoch) > 0);
    assert.ok(Number(byName.get('adc-rails')?.observations.faultCount) > 0);
    assert.ok((byName.get('watchdog-expiry')?.observations.restarts as string[]).includes('watchdog'));
    assert.equal(byName.get('malformed-diagnostics')?.observations.diagPhase, 0);
    assert.equal(byName.get('missing-tooth-fault')?.observations.syncLocked, false);
    assert.ok(Number(byName.get('missing-tooth-fault')?.observations.lossOfSyncCount) > 0);
    for (const scenario of scenarios) {
      assert.equal(scenario.qualification, 'cleanroom-model-execution');
    }
  });

  it('compacts noisy traces without losing event accounting', () => {
    for (const scenario of scenarios) {
      const compact = compactScenarioTrace(scenario);
      const preserved = compact.preservedEvents as TraceEvent[];
      const repeated = compact.repeatedEventSeries as { count: number }[];
      assert.equal(
        preserved.length + repeated.reduce((sum, series) => sum + series.count, 0),
        scenario.events.length,
        scenario.name,
      );
    }
  });
});
