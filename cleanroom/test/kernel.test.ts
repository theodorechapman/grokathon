/** Reset, initialisation, scheduling, watchdog, and interrupts. */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { createEcu } from '../src/ecu.ts';
import { RESET_TRACE } from '../src/kernel/reset.ts';
import { VECTOR_TABLE } from '../src/kernel/vector-table.ts';
import { BITS, IDATA, SFR, SFR_BITS, XRAM } from '../src/memory-map.ts';
import { MARKER_A, MARKER_B } from '../src/kernel/startup.ts';

describe('reset', () => {
  it('follows the proven trace 0000 -> 0073 ... -> 20e0 -> 5c00', () => {
    const ecu = createEcu();
    const outcome = ecu.powerOn();
    assert.deepEqual(outcome.trace, RESET_TRACE);
  });

  it('copies IP0.6 (WDTS) into PSW.F0 and starts the watchdog', () => {
    const ecu = createEcu();
    ecu.machine.sfr.setBit(SFR.IP0, SFR_BITS.IP0_WDTS, true);
    const outcome = ecu.powerOn();

    assert.equal(outcome.watchdogReset, true);
    assert.equal(ecu.machine.sfr.getBit(SFR.PSW, SFR_BITS.PSW_F0), true);
    assert.equal(ecu.machine.sfr.getBit(SFR.IEN1, SFR_BITS.IEN1_SWDT), true);
    assert.equal(ecu.machine.watchdog.isRunning(), true);
  });

  it('takes the cold path on the first start and the warm path after recovery', () => {
    const ecu = createEcu();
    const cold = ecu.powerOn();
    assert.equal(cold.warmStart, false);
    assert.equal(ecu.machine.xram.read(XRAM.startupMarkerA), MARKER_A);
    assert.equal(ecu.machine.xram.read(XRAM.startupMarkerB), MARKER_B);

    ecu.restart('recovery-2564');
    assert.equal(ecu.machine.xram.read(XRAM.retainedCounter), 1);
    assert.deepEqual(ecu.restarts, ['recovery-2564']);
  });
});

describe('vectors', () => {
  it('routes every source the specification names to its wrapper', () => {
    const byName = new Map(VECTOR_TABLE.map((v) => [v.source, v]));
    assert.equal(byName.get('ext0')?.vector, 0x0003);
    assert.equal(byName.get('ext0')?.worker, 0x2606);
    assert.equal(byName.get('timer1')?.vector, 0x001b);
    assert.equal(byName.get('timer1')?.worker, 0x257d);
    assert.equal(byName.get('serial')?.vector, 0x0023);
    assert.equal(byName.get('serial')?.worker, 0x8960);
    assert.equal(byName.get('ext3cc0')?.vector, 0x0053);
    assert.equal(byName.get('ext3cc0')?.wrapper, 0x20a0);
  });

  it('treats ADC, external 2 and external 4-6 as immediate returns', () => {
    const stubs = VECTOR_TABLE.filter((v) => v.stub).map((v) => v.source);
    assert.deepEqual(stubs, ['adc', 'ext2', 'ext4', 'ext5', 'ext6']);
  });

  it('counts stub entries without doing work', () => {
    const ecu = createEcu();
    ecu.powerOn();
    ecu.machine.interrupts.setEnabled('adc', true);
    ecu.machine.pend('adc');
    ecu.runFor(1);
    assert.equal(ecu.interruptCounts().stubWrappers, 1);
  });
});

describe('foreground executive', () => {
  it('runs a fixed service sequence with housekeeping between services', () => {
    const ecu = createEcu();
    ecu.powerOn();
    const services = ecu.executive.serviceNames();
    ecu.runFor(50);

    assert.ok(ecu.executive.cycles >= 4);
    assert.equal(ecu.executive.housekeepingCalls, ecu.executive.cycles * services.length);
    assert.equal(services[0], 'adc-scan');
    assert.ok(services.indexOf('engine-load') < services.indexOf('fuel'));
    assert.ok(services.indexOf('air-mass') < services.indexOf('engine-load'));
  });

  it('never idles: the cycle count keeps rising with time', () => {
    const ecu = createEcu();
    ecu.powerOn();
    ecu.runFor(20);
    const first = ecu.executive.cycles;
    ecu.runFor(20);
    assert.ok(ecu.executive.cycles > first);
  });
});

describe('timer-1 supervision', () => {
  it('refreshes the watchdog, raises BITS:002d and decrements the heartbeat', () => {
    const ecu = createEcu();
    ecu.powerOn();
    const before = ecu.machine.idata.read(IDATA.heartbeat);
    ecu.machine.pend('timer1');
    ecu.runFor(1);

    assert.equal(ecu.machine.idata.getBit(BITS.timer1Serviced), true);
    assert.equal(ecu.machine.idata.read(IDATA.heartbeat), before - 1);
    assert.ok(ecu.machine.watchdog.refreshes > 0);
  });

  it('restarts when the heartbeat expires', () => {
    const ecu = createEcu();
    ecu.powerOn();
    ecu.machine.idata.write(IDATA.heartbeat, 1);
    ecu.supervisor.service();
    assert.deepEqual(ecu.restarts, ['recovery-2564']);
  });
});

describe('deferred INT0 worker', () => {
  it('is software-pended, runs its chain, and clears EX0', () => {
    const ecu = createEcu();
    ecu.powerOn();
    ecu.deferred.request();
    assert.equal(ecu.machine.sfr.getBit(SFR.IEN0, SFR_BITS.IEN0_EX0), true);

    ecu.runFor(1);
    assert.equal(ecu.deferred.runs, 1);
    assert.equal(ecu.machine.sfr.getBit(SFR.IEN0, SFR_BITS.IEN0_EX0), false);
  });
});

describe('watchdog', () => {
  it('expiry restarts software control and sets the reset status', () => {
    const ecu = createEcu({ assumptions: { watchdogTimeoutMs: 1 } });
    ecu.powerOn();
    // Advance without ever reaching the foreground housekeeping refresh.
    ecu.machine.advance(1_000_000);
    assert.ok(ecu.machine.watchdog.expiries > 0);
    assert.deepEqual(ecu.restarts, ['watchdog']);
    assert.equal(ecu.machine.watchdog.resetStatus(), true);
  });
});
