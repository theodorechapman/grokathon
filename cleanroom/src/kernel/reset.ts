/**
 * Reset entry, CODE:0000.
 *
 * The deterministic emulator trace in SPECS is exact, and this reproduces it:
 *
 *   0000 -> 0073 -> 0075 -> 0077 -> 0079 -> 007b -> 20e0 -> 5c00
 *
 * "The instructions at 0073-007b copy IP0.6 (WDTS, the watchdog reset status)
 * into PSW F0, set IEN1.SWDT, and jump to 20e0. 20e0 is a trampoline to 5c00."
 *
 * The trace is returned so a test can assert on the sequence itself, which is
 * the single highest-confidence fact in the whole specification.
 */

import { SFR, SFR_BITS } from '../memory-map.ts';
import type { Machine } from '../hardware/machine.ts';

export const RESET_TRACE = [0x0000, 0x0073, 0x0075, 0x0077, 0x0079, 0x007b, 0x20e0, 0x5c00];

export interface ResetOutcome {
  trace: number[];
  /** The preserved watchdog reset status, now in PSW.F0. */
  watchdogReset: boolean;
}

/** Runs the wrapper at 0073-007b and hands control to the trampoline. */
export const runReset = (machine: Machine): ResetOutcome => {
  const trace: number[] = [0x0000, 0x0073];

  // 0073-0074: read IP0.6 (WDTS) and preserve it in PSW.F0.
  const watchdogReset = machine.sfr.getBit(SFR.IP0, SFR_BITS.IP0_WDTS);
  machine.sfr.setBit(SFR.PSW, SFR_BITS.PSW_F0, watchdogReset);
  trace.push(0x0075);

  // 0075-007a: start the watchdog through IEN1.SWDT.
  machine.watchdog.start();
  trace.push(0x0077, 0x0079);

  // 007b: jump to the trampoline, which jumps to initialisation.
  trace.push(0x007b, 0x20e0, 0x5c00);

  return { trace, watchdogReset };
};

/** PSW.F0 as left by the reset wrapper. */
export const watchdogResetFlag = (machine: Machine): boolean =>
  machine.sfr.getBit(SFR.PSW, SFR_BITS.PSW_F0);
