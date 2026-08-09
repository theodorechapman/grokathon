/** Operating-mode classification from live speed and load. */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { createEcu } from '../src/ecu.ts';

describe('operating modes', () => {
  /** Bench-side air flow rising with speed and throttle, as an AFM would. */
  const afm = (rpm: number, throttle: number): number =>
    Math.min(0xff, Math.round(0xff * throttle * (rpm / 6500)));

  const modeAt = (rpm: number, throttle: number): string => {
    const ecu = createEcu();
    ecu.powerOn();
    ecu.setAnalogInput(0, afm(rpm, throttle));
    for (const channel of [1, 2, 3, 4, 5]) ecu.setAnalogInput(channel, 0x80);
    ecu.spinCrank(rpm, 300);
    return ecu.parts.load.operatingMode();
  };

  it('separates idle, part load and wide open throttle', () => {
    assert.equal(modeAt(850, 0.08), 'idle');
    assert.equal(modeAt(3000, 0.35), 'part-load');
    assert.equal(modeAt(5200, 1.0), 'wide-open-throttle');
  });

  it('reports stopped before any capture arrives', () => {
    const ecu = createEcu();
    ecu.powerOn();
    ecu.runFor(30);
    assert.equal(ecu.parts.load.operatingMode(), 'stopped');
  });
});
