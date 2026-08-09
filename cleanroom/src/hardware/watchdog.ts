/**
 * Watchdog.
 *
 * Proven: reset copies IP0.6 (WDTS, the watchdog reset status) into PSW.F0 and
 * sets IEN1.SWDT before entering initialisation; the timer-1 worker refreshes
 * the watchdog every reload.
 *
 * SPECS: "No direct WDTREL reference was recovered, so a specific watchdog
 * timeout equation is not claimed." The timeout here is an assumption, supplied
 * from `Assumptions.watchdogTimeoutMs`. Whether an external watchdog also
 * resets the processor is likewise unresolved and is not modelled.
 */

import type { Ticks } from '../types.ts';
import { SFR, SFR_BITS } from '../memory-map.ts';
import { SfrFile } from './sfr-file.ts';

export class Watchdog {
  private remaining: Ticks;
  private running = false;
  refreshes = 0;
  expiries = 0;

  private readonly sfr: SfrFile;
  private readonly timeoutTicks: Ticks;
  private readonly onExpiry: () => void;

  constructor(sfr: SfrFile, timeoutTicks: Ticks, onExpiry: () => void) {
    this.sfr = sfr;
    this.timeoutTicks = timeoutTicks;
    this.onExpiry = onExpiry;
    this.remaining = timeoutTicks;
  }

  /** IEN1.SWDT — start (and, on a running watchdog, refresh). */
  start(): void {
    this.sfr.setBit(SFR.IEN1, SFR_BITS.IEN1_SWDT, true);
    this.running = true;
    this.remaining = this.timeoutTicks;
  }

  refresh(): void {
    if (!this.running) return;
    this.remaining = this.timeoutTicks;
    this.refreshes += 1;
  }

  isRunning(): boolean {
    return this.running;
  }

  remainingTicks(): Ticks {
    return this.remaining;
  }

  /** Reset status bit read by the startup sequence. */
  setResetStatus(on: boolean): void {
    this.sfr.setBit(SFR.IP0, SFR_BITS.IP0_WDTS, on);
  }

  resetStatus(): boolean {
    return this.sfr.getBit(SFR.IP0, SFR_BITS.IP0_WDTS);
  }

  advance(ticks: Ticks): void {
    if (!this.running) return;
    this.remaining -= ticks;
    if (this.remaining > 0) return;
    this.expiries += 1;
    this.running = false;
    this.remaining = this.timeoutTicks;
    this.setResetStatus(true);
    this.onExpiry();
  }

  stop(): void {
    this.running = false;
    this.sfr.setBit(SFR.IEN1, SFR_BITS.IEN1_SWDT, false);
  }
}
