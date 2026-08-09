/**
 * Falsifiable constraints on the assumptions.
 *
 * Several values in `assumptions.ts` are not free: the specification proves
 * enough to bound them. An assumption that violates one of these is wrong, and
 * this file exists so that a wrong one fails rather than quietly producing
 * plausible-looking numbers.
 *
 * Nothing here consults the original binary. Every bound is derived from a
 * proven value, a register width, or the arithmetic of the part itself.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { DEFAULT_ASSUMPTIONS, SPEC_PROVEN, timerClockHz } from '../src/assumptions.ts';

const a = DEFAULT_ASSUMPTIONS;

/** Redline implied by the proven limit byte and the XDF equation. */
const REDLINE_RPM = a.revLimitNumerator / SPEC_PROVEN.revLimitByte;

describe('encoded engine speed fits its register', () => {
  it('the redline must be representable in the one byte at INTMEM:003b', () => {
    // The limit byte is proven, the register is one byte, so the scale has a
    // hard floor: below it, the engine could not reach its own rev limiter
    // without the speed byte saturating first.
    const minimumScale = REDLINE_RPM / 0xff;
    assert.ok(
      a.rpmPerSpeedCount >= minimumScale,
      `rpmPerSpeedCount ${a.rpmPerSpeedCount} is below the floor ${minimumScale.toFixed(2)} set by the proven redline`,
    );
  });

  it('keeps usable headroom above the redline without wasting most of the range', () => {
    const fullScale = 0xff * a.rpmPerSpeedCount;
    assert.ok(fullScale > REDLINE_RPM, 'full scale must exceed the redline');
    assert.ok(
      fullScale < REDLINE_RPM * 3,
      `full scale ${fullScale} rpm wastes most of the byte against a ${REDLINE_RPM.toFixed(0)} rpm redline`,
    );
  });
});

describe('capture periods fit Timer 2', () => {
  /** Ticks between crank captures at a given speed. */
  const periodTicks = (rpm: number): number =>
    timerClockHz(a) / ((rpm * a.crankEventsPerRevolution) / 60);

  it('does not overflow the 16-bit counter even at cranking speed', () => {
    // Below this the capture period exceeds the counter and the extended
    // timestamp could not be reconstructed from a single epoch byte.
    const crankingRpm = 50;
    assert.ok(
      periodTicks(crankingRpm) <= 0xffff,
      `at ${crankingRpm} rpm a capture period is ${periodTicks(crankingRpm).toFixed(0)} ticks, past the 16-bit boundary`,
    );
  });

  it('still resolves the period at the redline', () => {
    // Too few ticks per capture and speed resolution collapses.
    assert.ok(
      periodTicks(REDLINE_RPM) >= 32,
      `at the redline a capture period is only ${periodTicks(REDLINE_RPM).toFixed(0)} ticks`,
    );
  });
});

describe('the crank interrupt is serviceable', () => {
  /**
   * Machine cycles available between captures at the redline. A capture worker
   * that latches CRCL/CRCH, reads TH2, applies the rollover correction and
   * stores a three-byte triplet is realistically 40-120 cycles on this part.
   */
  const NOMINAL_ISR_CYCLES = 60;

  it('leaves the CPU time to do anything else', () => {
    const cyclesBetween = timerClockHz(a) / ((REDLINE_RPM * a.crankEventsPerRevolution) / 60);
    const load = NOMINAL_ISR_CYCLES / cyclesBetween;
    assert.ok(
      load < 0.5,
      `the crank ISR alone would take ${(load * 100).toFixed(0)}% of the CPU at the redline ` +
        `(${cyclesBetween.toFixed(0)} machine cycles between captures) — the tooth count and ` +
        `oscillator assumptions are jointly implausible`,
    );
  });
});

describe('scheduling periods are representable', () => {
  it('the timer-1 reload fits a 16-bit timer', () => {
    const ticks = (timerClockHz(a) * a.timer1PeriodMs) / 1000;
    assert.ok(ticks > 0 && ticks <= 0x10000, `timer-1 period is ${ticks} ticks`);
  });

  it('the watchdog outlives a foreground cycle', () => {
    // Housekeeping refreshes the watchdog between services, so a timeout
    // shorter than a cycle would reset the ECU during normal operation.
    assert.ok(
      a.watchdogTimeoutMs > a.foregroundCycleMs,
      `a ${a.watchdogTimeoutMs} ms watchdog cannot survive a ${a.foregroundCycleMs} ms foreground cycle`,
    );
  });

  it('the heartbeat outlives several timer-1 periods', () => {
    assert.ok(a.heartbeatReload >= 4, 'the heartbeat must tolerate a few missed reloads');
  });
});

describe('the rev-limit conversions agree with each other', () => {
  it('the buffer is a small fraction of the limit, not a comparable quantity', () => {
    const bufferRpm = SPEC_PROVEN.revLimitBuffer * a.rpmPerBufferCount;
    assert.ok(
      bufferRpm > 0 && bufferRpm < REDLINE_RPM * 0.1,
      `a ${bufferRpm} rpm buffer against a ${REDLINE_RPM.toFixed(0)} rpm limit is not a hysteresis band`,
    );
  });
});

describe('sensor conversions span a real range', () => {
  it('the supply channel covers a charging-system voltage', () => {
    const fullScale = a.adcReferenceVolts * a.supplyDividerRatio;
    assert.ok(fullScale > 14 && fullScale < 40, `supply full scale is ${fullScale} V`);
  });

  it('the temperature channels span both ends of an engine warm-up', () => {
    for (const [name, perCount, offset] of [
      ['coolant', a.coolantDegCPerCount, a.coolantDegCOffset],
      ['intake air', a.intakeAirDegCPerCount, a.intakeAirDegCOffset],
    ] as const) {
      const ends = [offset, 0xff * perCount + offset].sort((x, y) => x - y);
      assert.ok(ends[0] < -20, `${name} does not reach a cold-start temperature (${ends[0]} C)`);
      assert.ok(ends[1] > 100, `${name} does not reach a hot temperature (${ends[1]} C)`);
    }
  });
});
