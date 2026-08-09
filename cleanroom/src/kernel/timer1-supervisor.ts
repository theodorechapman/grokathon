/**
 * Timer-1 supervision, CODE:001b -> 2050 -> 257d.
 *
 * "Timer 1 enters 257d, refreshes the watchdog, reloads TH1/TL1, raises
 * BITS:002d, and decrements heartbeat INTMEM:0068. Expiry reaches restart."
 *
 * The heartbeat is a countdown that some other part of the system is expected
 * to reload; if nothing does, it reaches zero and the supervisor restarts
 * software control. That is the specification's "expiry reaches restart", and
 * it is the one place in this model where a missed deadline is fatal.
 */

import type { RestartReason } from '../context.ts';
import { msToTicks } from '../assumptions.ts';
import { BITS, IDATA } from '../memory-map.ts';
import type { Machine } from '../hardware/machine.ts';

export class Timer1Supervisor {
  services = 0;

  private readonly machine: Machine;
  private readonly restart: (reason: RestartReason) => void;

  constructor(machine: Machine, restart: (reason: RestartReason) => void) {
    this.machine = machine;
    this.restart = restart;
  }

  initialise(): void {
    this.machine.idata.write(IDATA.heartbeat, this.machine.assumptions.heartbeatReload);
    this.machine.idata.setBit(BITS.timer1Serviced, false);
  }

  /** CODE:257d. */
  service(): void {
    const { idata, watchdog, timer1, assumptions } = this.machine;

    watchdog.refresh();
    timer1.reloadForPeriod(msToTicks(assumptions, assumptions.timer1PeriodMs));
    idata.setBit(BITS.timer1Serviced, true);
    this.services += 1;

    const { expired } = idata.decrementToZero(IDATA.heartbeat);
    if (expired) this.restart('recovery-2564');
  }

  /** The foreground cycle proves it is still running. */
  kick(): void {
    this.machine.idata.write(IDATA.heartbeat, this.machine.assumptions.heartbeatReload);
  }

  heartbeat(): number {
    return this.machine.idata.read(IDATA.heartbeat);
  }
}
