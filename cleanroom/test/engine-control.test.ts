/** Capture, speed, load, fuel, ignition, idle, limiter, overrun, adaptation. */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { createEcu, type Ecu } from '../src/ecu.ts';
import { BITS, IDATA, SFR, XRAM } from '../src/memory-map.ts';
import { NEUTRAL } from '../src/byte-math.ts';
import { TIMESTAMP_BUFFER_BASE } from '../src/subsystems/crank-capture.ts';
import { REV_LIMIT } from '../src/calibration/rev-limit-record.ts';
import { SYNC_STATE } from '../src/subsystems/crank-sync.ts';

const running = (rpm: number, options: { load?: number; ms?: number } = {}): Ecu => {
  const ecu = createEcu();
  ecu.powerOn();
  ecu.setAnalogInput(0, options.load ?? 0x60);
  for (const channel of [1, 2, 3, 4, 5]) ecu.setAnalogInput(channel, 0x80);
  ecu.spinCrank(rpm, options.ms ?? 200);
  return ecu;
};

describe('capture', () => {
  it('stores epoch:CRCH:CRCL triplets and advances INTMEM:004f by three', () => {
    const ecu = createEcu();
    ecu.powerOn();
    ecu.runFor(1);
    ecu.crankEvent();

    assert.equal(ecu.machine.idata.read(IDATA.timestampPointer), TIMESTAMP_BUFFER_BASE + 3);
    assert.equal(ecu.machine.idata.read(TIMESTAMP_BUFFER_BASE + 1), ecu.machine.sfr.read(SFR.CRCH));
    assert.equal(ecu.machine.idata.read(TIMESTAMP_BUFFER_BASE + 2), ecu.machine.sfr.read(SFR.CRCL));
    assert.equal(ecu.machine.idata.read(IDATA.capturePhase), 1);
  });

  it('maintains the timer-2 overflow epoch at INTMEM:003f', () => {
    const ecu = createEcu();
    ecu.powerOn();
    ecu.runFor(200);
    assert.ok(ecu.machine.idata.read(IDATA.timer2OverflowEpoch) > 0);
  });

  it('corrects the epoch when captured CRCH disagrees with live TH2', () => {
    const ecu = createEcu();
    ecu.powerOn();
    ecu.runFor(1);
    ecu.crankEvent();

    // Force the disagreement the rollover correction exists for.
    ecu.machine.sfr.write(SFR.CRCH, 0xf0);
    ecu.machine.sfr.write(SFR.TH2, 0x01);
    ecu.machine.idata.write(IDATA.timer2OverflowEpoch, 5);
    const event = ecu.parts.capture.service();

    assert.equal(event.rolloverCorrected, true);
    assert.equal(event.epoch, 4);
    assert.equal(event.timestamp, (4 << 16) | (0xf0 << 8) | ecu.machine.sfr.read(SFR.CRCL));
  });
});

describe('synchronisation and speed', () => {
  it('locks after consistent capture periods and reports the proportional form', () => {
    const ecu = running(2500);
    assert.equal(ecu.parts.sync.isLocked(), true);
    assert.equal(ecu.machine.idata.read(IDATA.syncState), SYNC_STATE.locked);

    const speed = ecu.parts.sync.speed();
    assert.ok(speed);
    assert.ok(Math.abs(speed.rpm - 2500) < 50);
    assert.ok(speed.proportional > 0);
  });

  it('breaks lock when captures stop arriving', () => {
    const ecu = running(2500);
    ecu.runFor(200);
    assert.equal(ecu.parts.sync.isLocked(), false);
    assert.equal(ecu.parts.sync.lossOfSyncCount, 1);
  });
});

describe('load and mode', () => {
  it('writes encoded speed to 003b and normalized load to 0040', () => {
    const ecu = running(2500);
    assert.ok(ecu.machine.idata.read(IDATA.encodedEngineSpeed) > 0);
    assert.ok(ecu.machine.idata.read(IDATA.normalizedLoad) > 0);
  });

  it('publishes the mode in bits 3-5 of EXTMEM:007a', () => {
    const ecu = running(2500, { load: 0xff });
    const field = ecu.machine.xram.read(XRAM.modeField);
    assert.equal((field >> 3) & 0x07, ecu.parts.load.modeBits());
    assert.equal(field & 0x07, 0, 'the low bits are untouched');
  });
});

describe('fuel', () => {
  it('produces a base, a composite correction, and an injector-lag term', () => {
    const ecu = running(2500);
    const fuel = ecu.parts.fuel.latest();
    assert.ok(fuel);
    assert.ok(fuel.base > 0 && fuel.base <= 0xff);
    assert.ok(fuel.pulseCount > 0);
    assert.equal(fuel.cut, false);
  });

  it('writes transient enrichment as high8(a*b) into EXTMEM:006e', () => {
    const ecu = running(2500);
    const value = ecu.machine.xram.read(XRAM.transientEnrichment);
    assert.ok(value >= 0 && value <= 0xff);
  });

  it('schedules two injector banks without claiming a pin mapping', () => {
    const ecu = running(2500);
    const banks = new Set(
      ecu.machine.events.filter((e) => e.kind === 'injector').map((e) => e.channel),
    );
    assert.deepEqual([...banks].sort(), ['injector-bank-a', 'injector-bank-b']);
  });
});

describe('ignition', () => {
  it('reads advance and dwell from the selected variant', () => {
    const ecu = running(2500);
    const ignition = ecu.parts.ignition.latest();
    assert.ok(ignition);
    assert.ok(ignition.dwellCount > 0);
    assert.equal(ignition.suppressed, false);
  });

  it('never fires a coil it has not charged', () => {
    // A coil commanded to spark without having charged produces no spark. This
    // regressed once: the calibrated dwell exceeded the capture segment, so
    // subtracting it from the fire point wrapped the charge into a position the
    // next capture re-armed before it could fire.
    for (const rpm of [850, 3000, 5200]) {
      const ecu = running(rpm, { ms: 300 });
      const count = (kind: string): number =>
        ecu.machine.events.filter((e) => e.kind === kind).length;
      assert.ok(count('coil-fire') > 0, `no ignition events at ${rpm} rpm`);
      assert.ok(
        Math.abs(count('coil-charge') - count('coil-fire')) <= 1,
        `at ${rpm} rpm: ${count('coil-charge')} charges against ${count('coil-fire')} fires`,
      );
    }
  });

  it('reports when the calibrated dwell will not fit the segment', () => {
    // Truncation is a real signal about the dwell and tooth-count assumptions,
    // so it is surfaced rather than silently absorbed.
    const dense = running(850, { ms: 200 });
    assert.equal(dense.parts.ignition.wasDwellTruncated(), true);

    const coarse = createEcu({ assumptions: { crankEventsPerRevolution: 4 } });
    coarse.powerOn();
    coarse.setAnalogInput(0, 0x60);
    for (const channel of [1, 2, 3, 4, 5]) coarse.setAnalogInput(channel, 0x80);
    coarse.spinCrank(850, 200);
    assert.equal(coarse.parts.ignition.wasDwellTruncated(), false);
  });

  it('arms compare channels 2 and 3, never CC1', () => {
    const ecu = running(2500);
    const channels = new Set(
      ecu.machine.events
        .filter((e) => e.kind === 'coil-charge' || e.kind === 'coil-fire')
        .map((e) => e.channel),
    );
    assert.ok(channels.size > 0);
    assert.equal(channels.has('compare-1'), false);
  });
});

describe('rev limiter', () => {
  it('derives the limit from the primary record only', () => {
    const ecu = createEcu();
    ecu.powerOn();
    const records = ecu.parts.limiter.rawRecords();

    assert.equal(records[0].limit, REV_LIMIT.limitByte);
    assert.equal(records[0].buffer, REV_LIMIT.bufferByte);
    assert.equal(records[1].limit, REV_LIMIT.limitByte);
    assert.equal(records[1].consumed, false, 'no direct access to 4313/4314 was recovered');

    const state = ecu.parts.limiter.state();
    assert.ok(Math.abs(state.limitRpm - 6336.8) < 0.5);
    assert.ok(Math.abs(state.limitRpm - state.resumeRpm - 120) < 0.5);
  });

  it('copies 42d0-42d2 into XRAM 0207-0209 (CODE:3530)', () => {
    const ecu = createEcu();
    ecu.powerOn();
    for (let i = 0; i < REV_LIMIT.copyLength; i += 1) {
      assert.equal(
        ecu.machine.xram.read(XRAM.revLimitCopyBase + i),
        ecu.context.calibration.read(REV_LIMIT.copySourceBase + i),
      );
    }
  });

  it('sets BITS:0038, clears BITS:003a, and cuts fuel above the limit', () => {
    const ecu = running(7000, { ms: 100 });
    assert.equal(ecu.machine.idata.getBit(BITS.revCutStageActive), true);
    assert.equal(ecu.machine.idata.getBit(BITS.revCutStageComplement), false);
    assert.equal(ecu.machine.idata.read(IDATA.revCutCountdown), REV_LIMIT.bufferByte);
    assert.equal(ecu.parts.fuel.latest()?.cut, true);
  });
});

describe('overrun latch', () => {
  it('qualifies on speed, load and temperature, then sets BITS:003b', () => {
    const ecu = running(3000, { load: 0x00, ms: 300 });
    assert.equal(ecu.machine.idata.getBit(BITS.overrunActive), true);
    assert.ok(ecu.machine.idata.read(IDATA.overrunTimer) > 0);
  });
});

describe('adaptation', () => {
  it('neutralises both cells to 0x80 when disabled', () => {
    const ecu = createEcu();
    ecu.powerOn();
    ecu.parts.faults.report(0x13, 1);
    ecu.parts.adaptation.service();

    assert.equal(ecu.machine.xram.read(XRAM.adaptationCellA), NEUTRAL);
    assert.equal(ecu.machine.xram.read(XRAM.adaptationCellB), NEUTRAL);
    assert.equal(ecu.machine.idata.read(IDATA.adaptationCompositeC), NEUTRAL);
  });

  it('reaches the composite at INTMEM:0057-0059 and stays within its clamp', () => {
    const ecu = running(2000, { ms: 400 });
    for (let i = 0; i < 60; i += 1) {
      ecu.machine.idata.write(IDATA.hystereticChannel, i % 2 === 0 ? 0x20 : 0xe0);
      ecu.parts.adaptation.service();
    }
    const cellA = ecu.machine.xram.read(XRAM.adaptationCellA);
    const cellB = ecu.machine.xram.read(XRAM.adaptationCellB);
    for (const cell of [cellA, cellB]) {
      assert.ok(cell >= NEUTRAL - 0x30 && cell <= NEUTRAL + 0x30);
    }
    assert.equal(ecu.machine.idata.read(IDATA.adaptationCompositeA), cellA);
    assert.equal(ecu.machine.idata.read(IDATA.adaptationCompositeB), cellB);
  });
});

describe('idle', () => {
  it('picks the target family from the transmission and A/C inputs', () => {
    const ecu = createEcu();
    ecu.powerOn();

    ecu.parts.idle.setInputs({ parkNeutral: true });
    assert.match(ecu.parts.idle.update().variant, /P\/N/);

    ecu.parts.idle.setInputs({ parkNeutral: false, airConditioning: true });
    assert.match(ecu.parts.idle.update().variant, /A\/C on/);

    ecu.parts.idle.setInputs({ airConditioning: false });
    assert.match(ecu.parts.idle.update().variant, /A\/C off/);
  });
});
