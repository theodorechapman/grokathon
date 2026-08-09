import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { scheduleNextCrankPulse } from '../src/schedule-next-crank-pulse.ts';
import { syntheticCrankGeometry } from '../src/synthetic-crank-geometry.ts';

const geometry = syntheticCrankGeometry.geometry;

describe('adaptive crank scheduler', () => {
  it('matches exact rational slot cycles for the fixed synthetic fixture', () => {
    let state: ReturnType<typeof scheduleNextCrankPulse>['state'] | null = null;
    const slots: Array<{ cycle: number; position: number; present: boolean }> = [];
    for (let index = 0; index < 13; index += 1) {
      const scheduled = scheduleNextCrankPulse(state, 850_000, geometry);
      slots.push(scheduled.slot);
      state = scheduled.state;
    }
    assert.deepEqual(
      slots.map((slot) => slot.cycle),
      [
        8, 5_890, 11_773, 17_655, 23_537, 29_420, 35_302, 41_184, 47_067,
        52_949, 58_832, 64_714, 70_596,
      ],
    );
    assert.equal(slots[11]!.position, 11);
    assert.equal(slots[11]!.present, false);
    assert.equal(slots[12]!.position, 0);
  });

  it('emits only the next two-cycle pulse and retains fractional remainder', () => {
    const first = scheduleNextCrankPulse(null, 850_000, geometry);
    assert.deepEqual(first.transitions, [
      { cycle: 0, event: 'cc0-line', level: 1 },
      { cycle: 8, event: 'cc0-line', level: 0 },
      { cycle: 10, event: 'cc0-line', level: 1 },
    ]);
    assert.ok(first.state.fractionalRemainderAngleUnits !== 0);
    const second = scheduleNextCrankPulse(first.state, 850_000, geometry);
    assert.equal(second.transitions.length, 2);
    assert.equal(second.transitions[1]!.cycle - second.transitions[0]!.cycle, 2);
  });

  it('adapts the next interval to live plant RPM without a full trace', () => {
    const first = scheduleNextCrankPulse(null, 850_000, geometry);
    const second = scheduleNextCrankPulse(first.state, 1_700_000, geometry);
    const third = scheduleNextCrankPulse(second.state, 1_700_000, geometry);
    assert.equal(second.slot.cycle, 5_890);
    assert.ok(third.slot.cycle < 11_773);
    assert.ok(second.transitions.length <= 2);
    assert.ok(third.transitions.length <= 2);
  });

  it('supports configurable positions and a configurable gap', () => {
    const compact = {
      ...geometry,
      positionsPerRevolution: 4,
      missingPositions: [1],
    } as const;
    let state: ReturnType<typeof scheduleNextCrankPulse>['state'] | null = null;
    const transitionCounts: number[] = [];
    for (let index = 0; index < 4; index += 1) {
      const scheduled = scheduleNextCrankPulse(state, 1_000_000, compact);
      transitionCounts.push(scheduled.transitions.length);
      state = scheduled.state;
    }
    assert.deepEqual(transitionCounts, [3, 0, 2, 2]);
  });

  it('records assumption provenance for every synthetic geometry field', () => {
    assert.deepEqual(
      Object.keys(syntheticCrankGeometry.provenance),
      Object.keys(syntheticCrankGeometry.geometry),
    );
    for (const item of Object.values(syntheticCrankGeometry.provenance)) {
      assert.equal(item.confidence, 'assumed');
      assert.ok(item.sources.length > 0);
      assert.ok(item.excludes.length > 0);
    }
  });

  it('rejects stopped, colliding, malformed, and mid-stream geometry changes', () => {
    assert.throws(() => scheduleNextCrankPulse(null, 0, geometry), /rpmMilli/);
    assert.throws(
      () =>
        scheduleNextCrankPulse(null, 850_000, {
          ...geometry,
          missingPositions: [11, 11],
        }),
      /unique and increasing/,
    );
    assert.throws(
      () => scheduleNextCrankPulse(null, 9_000_000_000, geometry),
      /distinct two-level pulses/,
    );
    const first = scheduleNextCrankPulse(null, 850_000, geometry);
    assert.throws(
      () =>
        scheduleNextCrankPulse(first.state, 850_000, {
          ...geometry,
          positionsPerRevolution: 24,
        }),
      /cannot change/,
    );
  });
});
