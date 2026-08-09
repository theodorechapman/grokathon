/**
 * The whole controller, assembled.
 *
 * Reset runs the proven 0000 -> ... -> 5c00 trace, initialisation brings up the
 * peripherals and the retained-state markers, the interrupt dispatcher routes
 * each vector to its worker, and the cooperative foreground executive runs the
 * fixed service sequence with no idle wait — as the specification describes.
 */

import type { Assumptions } from './assumptions.ts';
import { DEFAULT_ASSUMPTIONS, msToTicks } from './assumptions.ts';
import type { EcuContext, RestartReason } from './context.ts';
import type { InterruptSource, Ticks } from './types.ts';
import { Machine } from './hardware/machine.ts';
import { buildCalibrationImage } from './calibration/calibration-image.ts';
import { LookupService } from './calibration/lookup-service.ts';
import { runReset, type ResetOutcome } from './kernel/reset.ts';
import { runStartup, type StartupOutcome } from './kernel/startup.ts';
import { runRecovery } from './kernel/recovery.ts';
import { Timer1Supervisor } from './kernel/timer1-supervisor.ts';
import { DeferredWorker } from './kernel/deferred-worker.ts';
import { ForegroundExecutive } from './kernel/foreground-executive.ts';
import { createInterruptDispatcher } from './kernel/interrupt-service.ts';
import { buildForegroundServices, type Subsystems } from './ecu-services.ts';
import { buildSubsystems, type SubsystemBundle } from './ecu-subsystems.ts';
import { periodForRpm } from './subsystems/speed-estimate.ts';

export interface EcuOptions {
  assumptions?: Partial<Assumptions>;
}

export class Ecu {
  readonly machine: Machine;
  readonly context: EcuContext;
  readonly parts: SubsystemBundle;
  readonly supervisor: Timer1Supervisor;
  readonly deferred: DeferredWorker;
  readonly executive: ForegroundExecutive;

  readonly restarts: RestartReason[] = [];
  private readonly counters = { external1: 0, stubs: 0 };
  private readonly dispatch: (source: InterruptSource) => void;
  private foregroundDebt: Ticks = 0;
  private started = false;

  constructor(options: EcuOptions = {}) {
    const assumptions: Assumptions = { ...DEFAULT_ASSUMPTIONS, ...options.assumptions };
    this.machine = new Machine(assumptions);
    const calibration = buildCalibrationImage();

    this.context = {
      machine: this.machine,
      calibration,
      lookup: new LookupService(this.machine.idata, calibration),
      assumptions,
      reportFault: (identifier, subtype, a, b) =>
        void this.parts.faults.report(identifier, subtype, a, b),
      restart: (reason) => this.restart(reason),
    };

    this.parts = buildSubsystems(this.context);
    this.supervisor = new Timer1Supervisor(this.machine, (reason) => this.restart(reason));
    this.deferred = new DeferredWorker(this.machine, {
      adc: () => this.parts.adc.scan(),
      timing: () => this.parts.sync.checkTimeout(),
      state: () => this.parts.load.update(),
      serial: () => this.parts.session.service(),
    });

    this.dispatch = createInterruptDispatcher(
      this.machine,
      {
        ext0: () => this.deferred.run(),
        timer1: () => this.supervisor.service(),
        serial: () => this.parts.uart.onSerialInterrupt(),
        ext3cc0: () => this.parts.sync.onCaptureInterrupt(),
        timer2: () => this.parts.capture.onTimer2Overflow(),
      },
      this.counters,
    );

    this.executive = new ForegroundExecutive(
      buildForegroundServices(this.parts as Subsystems),
      () => this.housekeeping(),
      () => this.supervisor.kick(),
    );

    this.machine.onWatchdogExpiry = () => this.restart('watchdog');
  }

  /** Power-on: the proven reset trace, then initialisation. */
  powerOn(): ResetOutcome & StartupOutcome {
    this.machine.powerOnReset();
    const reset = runReset(this.machine);
    const startup = this.initialise('power-on');
    this.started = true;
    return { ...reset, ...startup };
  }

  private initialise(reason: RestartReason): StartupOutcome {
    const outcome = runStartup(this.machine, reason);
    this.supervisor.initialise();
    for (const part of this.parts.initialisable) part.initialise();
    return outcome;
  }

  /** CODE:2564 -> 5c00, or the serial timeout path, or the watchdog. */
  restart(reason: RestartReason): void {
    this.restarts.push(reason);
    runRecovery(this.machine, reason, () => this.parts.adc.scan());
    this.initialise(reason);
    this.machine.watchdog.start();
  }

  /** CODE:6096 — housekeeping, called between every pair of services. */
  private housekeeping(): void {
    this.machine.watchdog.refresh();
    this.parts.sync.checkTimeout();
  }

  /** Advance time, servicing interrupts and running foreground cycles. */
  step(ticks: Ticks): void {
    if (!this.started) throw new Error('powerOn() must run before step()');
    const cyclePeriod = msToTicks(this.context.assumptions, this.context.assumptions.foregroundCycleMs);
    let remaining = ticks;
    while (remaining > 0) {
      const slice = Math.min(remaining, Math.max(1, cyclePeriod - this.foregroundDebt));
      this.machine.advance(slice);
      this.machine.interrupts.serviceAll(this.dispatch);
      remaining -= slice;
      this.foregroundDebt += slice;
      if (this.foregroundDebt >= cyclePeriod) {
        this.foregroundDebt = 0;
        this.executive.cycle();
        this.machine.interrupts.serviceAll(this.dispatch);
      }
    }
  }

  runFor(milliseconds: number): void {
    this.step(msToTicks(this.context.assumptions, milliseconds));
  }

  /** Bench input: one external-3/CC0 capture event. */
  crankEvent(): void {
    this.machine.pend('ext3cc0');
    this.machine.interrupts.serviceAll(this.dispatch);
  }

  /** Bench input: spin the crank at a speed for a while. */
  spinCrank(rpm: number, milliseconds: number): void {
    const period = periodForRpm(this.context.assumptions, rpm);
    if (period <= 0) return;
    const total = msToTicks(this.context.assumptions, milliseconds);
    // Advance by whole capture periods, then run out the remainder, so the
    // clock lands exactly on the requested duration instead of overshooting by
    // up to one period.
    let elapsed = 0;
    while (elapsed + period <= total) {
      this.step(period);
      this.crankEvent();
      elapsed += period;
    }
    if (elapsed < total) this.step(total - elapsed);
  }

  /** Bench input: drive an ADC channel. */
  setAnalogInput(channel: number, raw: number): void {
    this.machine.adc.setInput(channel, raw);
  }

  /** Bench input: a diagnostic byte from the tester. */
  receiveDiagnosticByte(byte: number): void {
    this.machine.serial.enableInterrupt(true);
    this.machine.serial.deliver(byte);
    this.machine.interrupts.serviceAll(this.dispatch);
  }

  interruptCounts(): Record<string, number> {
    const counts: Record<string, number> = {
      external1Wrappers: this.counters.external1,
      stubWrappers: this.counters.stubs,
    };
    for (const [source, count] of this.machine.interrupts.counts) counts[source] = count;
    return counts;
  }
}

export const createEcu = (options: EcuOptions = {}): Ecu => new Ecu(options);
