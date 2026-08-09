/**
 * Interrupt dispatch: which wrapper does what.
 *
 * "Firmware proves four substantial interrupt paths: external 0 (0003 -> 2000
 * -> 2606); timer 1 (001b -> 2050 -> 257d); serial (0023 -> 2060 -> 8960);
 * external 3/CC0 (0053 -> 20a0 -> {21d8, 2462}). Timer 0, external 1, and timer
 * 2 perform small counter/register updates at 2010-2014, 2030-203d, and
 * 2070-2074. ADC, external 2, and external 4-6 immediately return."
 *
 * The counters at INTMEM:0016-0017 are described only as "interrupt-maintained
 * counters; their units are unknown". Timer 0 maintains them here. External 1's
 * register is not identified in the specification, so its wrapper counts its
 * own invocations and touches nothing it cannot justify.
 */

import type { InterruptSource } from '../types.ts';
import { IDATA } from '../memory-map.ts';
import type { Machine } from '../hardware/machine.ts';
import { STUB_SOURCES } from './vector-table.ts';

export interface InterruptWorkers {
  /** CODE:2606 — the deferred worker chain. */
  ext0(): void;
  /** CODE:257d — timer-1 supervision. */
  timer1(): void;
  /** CODE:8960 — the serial worker. */
  serial(): void;
  /** CODE:20a0 — capture dispatch. */
  ext3cc0(): void;
  /** CODE:2070-2074 — epoch increment and TF2 clear. */
  timer2(): void;
}

export interface DispatchCounters {
  external1: number;
  stubs: number;
}

export const createInterruptDispatcher = (
  machine: Machine,
  workers: InterruptWorkers,
  counters: DispatchCounters,
): ((source: InterruptSource) => void) => {
  const stubs = new Set<InterruptSource>(STUB_SOURCES);

  return (source: InterruptSource): void => {
    switch (source) {
      case 'ext0':
        workers.ext0();
        return;
      case 'timer1':
        workers.timer1();
        return;
      case 'serial':
        workers.serial();
        return;
      case 'ext3cc0':
        workers.ext3cc0();
        return;
      case 'timer2':
        workers.timer2();
        return;
      case 'timer0': {
        // CODE:2010-2014 — advance the 16-bit interrupt-maintained counter.
        const low = machine.idata.increment(IDATA.interruptCounterHigh);
        if (low === 0) machine.idata.increment(IDATA.interruptCounterLow);
        return;
      }
      case 'ext1':
        // CODE:2030-203d — a small register update whose target the
        // specification does not identify.
        counters.external1 += 1;
        return;
      default:
        if (stubs.has(source)) {
          counters.stubs += 1;
          return;
        }
        throw new Error(`no worker for interrupt source ${source}`);
    }
  };
};
