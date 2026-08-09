/**
 * Timer 2 with the compare/capture unit.
 *
 * This is the spine of the engine-timing subsystems. The specification proves:
 *  - a 16-bit free-running count in TH2:TL2;
 *  - a capture register CRCH:CRCL loaded by the external-3/CC0 event;
 *  - compare channels CC2 and CC3 in active use (no direct CC1 use recovered);
 *  - an overflow epoch byte maintained by the timer-2 interrupt, extending
 *    capture timestamps past the 16-bit boundary.
 *
 * Compare channels are single-shot here: arming schedules one crossing, and the
 * consumer re-arms. That matches "calibrated advance/dwell is converted to
 * timer-domain deadlines, and compare events update output state".
 */

import type { Ticks } from '../types.ts';
import { SFR } from '../memory-map.ts';
import { SfrFile } from './sfr-file.ts';

export type CompareChannel = 1 | 2 | 3;

interface ArmedCompare {
  value: number;
  action: () => void;
  label: string;
}

/** Distance in ticks from `from` to the next occurrence of `to`, in 1..65536. */
const distance = (from: number, to: number): number => (((to - from - 1) & 0xffff) + 1);

export class Timer2 {
  private counter = 0;
  private readonly compares = new Map<CompareChannel, ArmedCompare>();

  private readonly sfr: SfrFile;
  private readonly onOverflow: () => void;

  constructor(sfr: SfrFile, onOverflow: () => void) {
    this.sfr = sfr;
    this.onOverflow = onOverflow;
  }

  value(): number {
    return this.counter;
  }

  /** Latch the live count into CRCH:CRCL, as the CC0 capture event does. */
  capture(): { high: number; low: number } {
    this.sfr.writePair(SFR.CRCH, SFR.CRCL, this.counter);
    return { high: this.sfr.read(SFR.CRCH), low: this.sfr.read(SFR.CRCL) };
  }

  capturedValue(): number {
    return this.sfr.readPair(SFR.CRCH, SFR.CRCL);
  }

  arm(channel: CompareChannel, value: number, label: string, action: () => void): void {
    this.compares.set(channel, { value: value & 0xffff, action, label });
    this.writeCompareRegisters(channel, value & 0xffff);
  }

  disarm(channel: CompareChannel): void {
    this.compares.delete(channel);
  }

  armed(channel: CompareChannel): number | null {
    return this.compares.get(channel)?.value ?? null;
  }

  /** Advance the count, firing overflow and compare events in time order. */
  advance(ticks: Ticks): void {
    if (ticks <= 0) return;
    let remaining = ticks;
    while (remaining > 0) {
      const next = this.nextEvent(remaining);
      this.counter = (this.counter + next.step) & 0xffff;
      this.writeCountRegisters();
      remaining -= next.step;
      for (const fire of next.fire) fire();
    }
  }

  private nextEvent(budget: number): { step: number; fire: Array<() => void> } {
    let step = budget;
    const candidates: Array<{ at: number; fire: () => void }> = [];

    const overflowIn = distance(this.counter, 0);
    if (overflowIn <= budget) {
      step = Math.min(step, overflowIn);
      candidates.push({ at: overflowIn, fire: () => this.onOverflow() });
    }

    for (const [channel, compare] of this.compares) {
      const at = distance(this.counter, compare.value);
      if (at > budget) continue;
      step = Math.min(step, at);
      candidates.push({
        at,
        fire: () => {
          this.compares.delete(channel);
          compare.action();
        },
      });
    }

    return { step, fire: candidates.filter((c) => c.at === step).map((c) => c.fire) };
  }

  private writeCountRegisters(): void {
    this.sfr.writePair(SFR.TH2, SFR.TL2, this.counter);
  }

  private writeCompareRegisters(channel: CompareChannel, value: number): void {
    const pairs: Record<CompareChannel, [number, number]> = {
      1: [SFR.CCH1, SFR.CCL1],
      2: [SFR.CCH2, SFR.CCL2],
      3: [SFR.CCH3, SFR.CCL3],
    };
    const [high, low] = pairs[channel];
    this.sfr.writePair(high, low, value);
  }

  reset(): void {
    this.counter = 0;
    this.compares.clear();
    this.writeCountRegisters();
  }
}
