/**
 * The SAB80C515 model: memory, registers, peripherals, and one clock.
 *
 * Time is measured in Timer-2 input clock ticks. SPECS: "Unknown: oscillator
 * frequency, absolute tick periods", so the tick-to-second conversion lives in
 * `Assumptions` and nothing here depends on it.
 */

import type { Assumptions } from '../assumptions.ts';
import { msToTicks, timerClockHz } from '../assumptions.ts';
import type { InterruptSource, OutputEvent, Ticks } from '../types.ts';
import { buildRomImage } from '../rom-image.ts';
import { AdcUnit } from './adc-unit.ts';
import { DigitalPorts } from './digital-ports.ts';
import { ExternalMemory } from './external-memory.ts';
import { InternalMemory } from './internal-memory.ts';
import { InterruptController } from './interrupt-controller.ts';
import { SerialPort } from './serial-port.ts';
import { SfrFile } from './sfr-file.ts';
import { Timer1 } from './timer1.ts';
import { Timer2 } from './timer2.ts';
import { Watchdog } from './watchdog.ts';

/** Output events retained for inspection. Older ones are discarded. */
export const MAX_RETAINED_EVENTS = 8192;

export class Machine {
  readonly sfr = new SfrFile();
  readonly idata = new InternalMemory();
  readonly xram = new ExternalMemory();
  readonly interrupts = new InterruptController(this.sfr);
  readonly ports = new DigitalPorts(this.sfr);
  readonly adc = new AdcUnit(this.sfr);
  readonly timer2: Timer2;
  readonly timer1: Timer1;
  readonly serial: SerialPort;
  readonly watchdog: Watchdog;
  /** Code space, used by the checksum routine and the code-read service. */
  readonly rom: Uint8Array = buildRomImage();
  readonly events: OutputEvent[] = [];

  private clock: Ticks = 0;

  /** Set by the ECU: what a watchdog expiry does. Left as a hook because SPECS
   *  does not resolve whether an external watchdog also resets the processor. */
  onWatchdogExpiry: () => void = () => {};

  readonly assumptions: Assumptions;

  constructor(assumptions: Assumptions) {
    this.assumptions = assumptions;
    this.timer2 = new Timer2(this.sfr, () => this.interrupts.pend('timer2'));
    this.timer1 = new Timer1(this.sfr, () => this.interrupts.pend('timer1'));
    this.serial = new SerialPort(
      this.sfr,
      () => this.interrupts.pend('serial'),
      Math.max(1, Math.round((timerClockHz(assumptions) * 10) / assumptions.kw71BaudRate)),
    );
    this.watchdog = new Watchdog(
      this.sfr,
      msToTicks(assumptions, assumptions.watchdogTimeoutMs),
      () => this.onWatchdogExpiry(),
    );
  }

  now(): Ticks {
    return this.clock;
  }

  ms(): number {
    return (this.clock * 1000) / timerClockHz(this.assumptions);
  }

  /** Advance every peripheral. Compare and overflow events fire inside
   *  `timer2.advance`, in time order, before this returns. */
  advance(ticks: Ticks): void {
    if (ticks <= 0) return;
    this.clock += ticks;
    this.timer2.advance(ticks);
    this.timer1.advance(ticks);
    this.serial.advance(ticks);
    this.watchdog.advance(ticks);
  }

  emit(event: Omit<OutputEvent, 'at'> & { at?: Ticks }): void {
    this.events.push({ ...event, at: event.at ?? this.clock });
    // The log is a diagnostic tail, not a record of everything that ever
    // happened: a running engine emits thousands of events per second, and an
    // unbounded array is a leak in any host that runs longer than an example.
    if (this.events.length > MAX_RETAINED_EVENTS) {
      this.events.splice(0, this.events.length - MAX_RETAINED_EVENTS);
    }
  }

  pend(source: InterruptSource): void {
    this.interrupts.pend(source);
  }

  /** Cold start. Retained XRAM is deliberately *not* cleared here: the startup
   *  routine's job is to decide, from its markers, whether the retained state
   *  is trustworthy. */
  powerOnReset(): void {
    this.clock = 0;
    // WDTS survives the reset it reports on — that is the point of the bit, and
    // the reset wrapper at 0073 exists to read it.
    const watchdogStatus = this.watchdog.resetStatus();
    this.sfr.clear();
    this.watchdog.setResetStatus(watchdogStatus);
    this.idata.clear();
    this.interrupts.reset();
    this.ports.reset();
    this.adc.reset();
    this.timer1.reset();
    this.timer2.reset();
    this.serial.reset();
    this.events.length = 0;
  }
}
