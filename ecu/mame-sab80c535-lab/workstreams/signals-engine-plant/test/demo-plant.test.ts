import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { advanceDemoPlant } from '../src/advance-demo-plant.ts';
import { demoPlantConstants } from '../src/demo-plant-constants.ts';

const runPlant = (pedalPermille: number, steps: number) => {
  let state: ReturnType<typeof advanceDemoPlant> | null = null;
  for (let step = 0; step < steps; step += 1) {
    state = advanceDemoPlant(state, {
      pedalPermille,
      brakePermille: 0,
      starterEngaged: step < 80,
      injectorScheduleActive: true,
    });
  }
  return state!;
};

describe('fixed-step demo plant', () => {
  it('tags every selected numeric constant as an explicit assumption', () => {
    for (const entry of Object.values(demoPlantConstants)) {
      assert.equal(entry.provenance.confidence, 'assumed');
      assert.ok(entry.provenance.sources.length > 0);
      assert.ok(entry.provenance.claim.includes(String(entry.value)));
      assert.ok(entry.provenance.excludes.length > 0);
    }
  });

  it('replays integer state byte-for-byte', () => {
    const first = runPlant(750, 300);
    const second = runPlant(750, 300);
    assert.equal(JSON.stringify(first), JSON.stringify(second));
    for (const value of Object.values(first)) {
      if (typeof value === 'number') assert.ok(Number.isSafeInteger(value));
    }
  });

  it('causally maps pedal through throttle intent and AFM code to RPM', () => {
    const idle = runPlant(0, 300);
    const loaded = runPlant(1_000, 300);
    assert.equal(loaded.throttleIntentPermille, 1_000);
    assert.ok(loaded.afmCallbackCode > idle.afmCallbackCode);
    assert.ok(loaded.afmCallbackCode >= 0 && loaded.afmCallbackCode <= 127);
    assert.ok(loaded.rpmMilli > idle.rpmMilli);
  });

  it('fails combustion closed without injector schedule feedback', () => {
    const running = runPlant(800, 200);
    const active = advanceDemoPlant(running, {
      pedalPermille: 800,
      brakePermille: 0,
      starterEngaged: false,
      injectorScheduleActive: true,
    });
    const absent = advanceDemoPlant(running, {
      pedalPermille: 800,
      brakePermille: 0,
      starterEngaged: false,
      injectorScheduleActive: null,
    });
    assert.ok(active.combustionTorqueUnits > 0);
    assert.equal(absent.injectorScheduleFeedback, 'absent');
    assert.equal(absent.combustionTorqueUnits, 0);
    assert.ok(absent.rpmMilli < active.rpmMilli);
  });

  it('applies starter, drag, brake, inertia, and strict input bounds', () => {
    const starter = advanceDemoPlant(null, {
      pedalPermille: 0,
      brakePermille: 0,
      starterEngaged: true,
      injectorScheduleActive: null,
    });
    assert.ok(starter.starterTorqueUnits > 0);
    assert.ok(starter.rpmMilli > 0);
    const braked = advanceDemoPlant(runPlant(900, 200), {
      pedalPermille: 900,
      brakePermille: 1_000,
      starterEngaged: false,
      injectorScheduleActive: true,
    });
    assert.ok(braked.dragTorqueUnits > 0);
    assert.ok(braked.brakeTorqueUnits > 0);
    assert.ok(braked.netTorqueUnits < braked.combustionTorqueUnits);
    assert.throws(
      () =>
        advanceDemoPlant(null, {
          pedalPermille: 1_001,
          brakePermille: 0,
          starterEngaged: false,
          injectorScheduleActive: null,
        }),
      /pedalPermille/,
    );
  });
});
