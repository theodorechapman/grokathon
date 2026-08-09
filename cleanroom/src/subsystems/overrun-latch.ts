/**
 * Deceleration/overrun latch, CODE:3723.
 *
 * Proven: "CODE:3723 maintains a separate speed/load/temperature-qualified
 * BITS:003b deceleration/overrun latch with timer INTMEM:00a0." That is the
 * whole of the recovered behaviour — the qualifying thresholds are not named,
 * and "Unknown: overrun thresholds, output channels, and limp-mode transition
 * map."
 *
 * The three qualifiers are therefore implemented with model thresholds, and the
 * latch is exposed rather than being silently wired to an output.
 */

import { BITS, IDATA } from '../memory-map.ts';
import type { EcuContext } from '../context.ts';
import type { EngineLoad } from './engine-load.ts';
import type { CrankSync } from './crank-sync.ts';

/** Model thresholds, byte/engineering domain. Not firmware values. */
const QUALIFY = {
  minimumRpm: 1500,
  maximumLoad: 0x18,
  minimumCoolant: 0x40,
  /** Foreground passes the condition must hold before the latch sets. */
  debounce: 4,
} as const;

export class OverrunLatch {
  private readonly context: EcuContext;
  private readonly load: EngineLoad;
  private readonly sync: CrankSync;

  constructor(context: EcuContext, load: EngineLoad, sync: CrankSync) {
    this.context = context;
    this.load = load;
    this.sync = sync;
  }

  initialise(): void {
    const { idata } = this.context.machine;
    idata.setBit(BITS.overrunActive, false);
    idata.write(IDATA.overrunTimer, 0);
  }

  update(): void {
    const { idata } = this.context.machine;
    const rpm = this.sync.speed()?.rpm ?? 0;
    const { normalizedLoad } = this.load.comparisonInputs();
    const coolant = idata.read(IDATA.coolantTemperature);

    const qualified =
      rpm >= QUALIFY.minimumRpm &&
      normalizedLoad <= QUALIFY.maximumLoad &&
      coolant >= QUALIFY.minimumCoolant;

    if (!qualified) {
      idata.write(IDATA.overrunTimer, 0);
      idata.setBit(BITS.overrunActive, false);
      return;
    }

    const elapsed = idata.increment(IDATA.overrunTimer);
    if (elapsed >= QUALIFY.debounce) idata.setBit(BITS.overrunActive, true);
  }

  isActive(): boolean {
    return this.context.machine.idata.getBit(BITS.overrunActive);
  }

  timer(): number {
    return this.context.machine.idata.read(IDATA.overrunTimer);
  }
}
