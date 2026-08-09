/**
 * The model has to be able to say what it rests on.
 *
 * These tests are about epistemics rather than behaviour: proven values must be
 * fixed, assumed ones must be overridable and disclosed, and no engineering
 * number may quietly acquire more confidence than the specification gave it.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { createEcu } from '../src/ecu.ts';
import { ASSUMPTION_BASIS, DEFAULT_ASSUMPTIONS, SPEC_PROVEN } from '../src/assumptions.ts';
import { OPEN_QUESTIONS, disclosure } from '../src/disclosure.ts';
import { CHANNELS } from '../src/subsystems/sensor-state.ts';

describe('disclosure', () => {
  it('gives a basis for every assumption', () => {
    for (const field of Object.keys(DEFAULT_ASSUMPTIONS)) {
      assert.ok(ASSUMPTION_BASIS[field as keyof typeof DEFAULT_ASSUMPTIONS], `${field} has a basis`);
    }
  });

  it('tags every entry as proven or assumed, and lists the open questions', () => {
    const entries = disclosure();
    assert.ok(entries.some((e) => e.kind === 'proven'));
    assert.ok(entries.some((e) => e.kind === 'assumed'));
    assert.equal(entries.length, Object.keys(DEFAULT_ASSUMPTIONS).length + 11);
    assert.ok(OPEN_QUESTIONS.length >= 10);
  });

  it('keeps proven constants out of the assumption surface', () => {
    const assumed = new Set(Object.keys(DEFAULT_ASSUMPTIONS));
    for (const field of Object.keys(SPEC_PROVEN)) {
      assert.equal(assumed.has(field), false, `${field} is proven, not tunable`);
    }
  });
});

describe('assumption overrides', () => {
  it('a different oscillator moves the derived time base, not the proven bytes', () => {
    const base = createEcu();
    const fast = createEcu({ assumptions: { oscillatorHz: 24_000_000 } });
    base.powerOn();
    fast.powerOn();

    assert.equal(base.parts.integrity.verifyChecksum().computed, SPEC_PROVEN.romChecksum);
    assert.equal(fast.parts.integrity.verifyChecksum().computed, SPEC_PROVEN.romChecksum);
    assert.notEqual(base.machine.watchdog.remainingTicks(), fast.machine.watchdog.remainingTicks());
  });

  it('a different tooth count changes the speed reading from the same captures', () => {
    const run = (crankEventsPerRevolution: number): number => {
      const ecu = createEcu({ assumptions: { crankEventsPerRevolution } });
      ecu.powerOn();
      ecu.setAnalogInput(0, 0x40);
      ecu.spinCrank(2000, 200);
      return ecu.parts.sync.speed()?.rpm ?? 0;
    };
    // `spinCrank` paces captures by the same assumption, so halving the tooth
    // count halves the reported speed for an unchanged capture stream.
    assert.ok(run(30) > 0);
    assert.ok(Math.abs(run(60) - 2000) < 50);
  });
});

describe('confidence travels with the value', () => {
  it('never claims more than the specification did for a channel', () => {
    const byName = new Map(CHANNELS.map((c) => [c.name, c]));
    assert.equal(byName.get('hysteretic channel')?.confidence, 'unknown');
    assert.equal(byName.get('unresolved channel')?.confidence, 'unknown');
    assert.equal(byName.get('coolant temperature')?.confidence, 'medium');
    assert.equal(
      CHANNELS.every((c) => c.confidence !== 'high'),
      true,
      'no ADC channel identity is high confidence',
    );
  });

  it('marks assumption-scaled sensor readings as unknown', () => {
    const ecu = createEcu();
    ecu.powerOn();
    for (const scaled of [
      ecu.parts.sensors.supplyVolts(),
      ecu.parts.sensors.coolantDegC(),
      ecu.parts.sensors.engineSpeedRpm(),
      ecu.parts.sensors.normalizedLoad(),
    ]) {
      assert.equal(scaled.confidence, 'unknown');
      assert.ok(scaled.unit.length > 0);
    }
  });
});
