/**
 * Interrupt controller.
 *
 * The specification names three enable bits and one flag: IEN0.EA (cleared by
 * the recovery path at CODE:2564), IEN0.EX0 (cleared by the deferred worker
 * when its chain completes), IEN1.SWDT, and IRCON.TF2 (cleared by the timer-2
 * wrapper). Those live in the register image. Per-source enables that the
 * specification does not locate are held here and documented as model-local.
 *
 * Priority follows vector order, which is the part's behaviour for equal
 * priority levels. SPECS observes the priority state at SFR:00a9 but only
 * proves the WDTS bit inside it, so no priority-group logic is invented.
 */

import type { InterruptSource } from '../types.ts';
import { SFR, SFR_BITS } from '../memory-map.ts';
import { VECTOR_TABLE } from '../kernel/vector-table.ts';
import { SfrFile } from './sfr-file.ts';

export type InterruptHandler = (source: InterruptSource) => void;

export class InterruptController {
  private readonly pending = new Set<InterruptSource>();
  private readonly enabled = new Map<InterruptSource, boolean>();
  /** Nesting guard: a handler that pends another source is serviced after. */
  private servicing = false;
  readonly counts = new Map<InterruptSource, number>();

  private readonly sfr: SfrFile;

  constructor(sfr: SfrFile) {
    this.sfr = sfr;
    for (const entry of VECTOR_TABLE) this.enabled.set(entry.source, false);
  }

  globalEnable(on: boolean): void {
    this.sfr.setBit(SFR.IEN0, SFR_BITS.IEN0_EA, on);
  }

  isGloballyEnabled(): boolean {
    return this.sfr.getBit(SFR.IEN0, SFR_BITS.IEN0_EA);
  }

  setEnabled(source: InterruptSource, on: boolean): void {
    this.enabled.set(source, on);
    if (source === 'ext0') this.sfr.setBit(SFR.IEN0, SFR_BITS.IEN0_EX0, on);
  }

  isEnabled(source: InterruptSource): boolean {
    if (source === 'ext0') return this.sfr.getBit(SFR.IEN0, SFR_BITS.IEN0_EX0);
    return this.enabled.get(source) === true;
  }

  /** Hardware or software request. INT0 is software-pended by CODE:25f8-2605,
   *  which is why this is not restricted to peripheral callers. */
  pend(source: InterruptSource): void {
    this.pending.add(source);
  }

  isPending(source: InterruptSource): boolean {
    return this.pending.has(source);
  }

  clear(source: InterruptSource): void {
    this.pending.delete(source);
  }

  clearAll(): void {
    this.pending.clear();
  }

  /** Highest-priority pending source that is enabled, or null. */
  next(): InterruptSource | null {
    if (!this.isGloballyEnabled()) return null;
    for (const entry of VECTOR_TABLE) {
      if (this.pending.has(entry.source) && this.isEnabled(entry.source)) return entry.source;
    }
    return null;
  }

  /** Service everything currently deliverable. Returns how many ran. */
  serviceAll(handler: InterruptHandler, limit = 64): number {
    if (this.servicing) return 0;
    this.servicing = true;
    let serviced = 0;
    try {
      for (let i = 0; i < limit; i += 1) {
        const source = this.next();
        if (source === null) break;
        this.pending.delete(source);
        this.counts.set(source, (this.counts.get(source) ?? 0) + 1);
        handler(source);
        serviced += 1;
      }
    } finally {
      this.servicing = false;
    }
    return serviced;
  }

  reset(): void {
    this.pending.clear();
    this.counts.clear();
    for (const entry of VECTOR_TABLE) this.enabled.set(entry.source, false);
    this.globalEnable(false);
  }
}
