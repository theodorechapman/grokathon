"use strict";
/**
 * The whole controller, assembled.
 *
 * Reset runs the proven 0000 -> ... -> 5c00 trace, initialisation brings up the
 * peripherals and the retained-state markers, the interrupt dispatcher routes
 * each vector to its worker, and the cooperative foreground executive runs the
 * fixed service sequence with no idle wait — as the specification describes.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEcu = exports.Ecu = void 0;
const assumptions_ts_1 = require("./assumptions.js");
const machine_ts_1 = require("./hardware/machine.js");
const calibration_image_ts_1 = require("./calibration/calibration-image.js");
const lookup_service_ts_1 = require("./calibration/lookup-service.js");
const reset_ts_1 = require("./kernel/reset.js");
const startup_ts_1 = require("./kernel/startup.js");
const recovery_ts_1 = require("./kernel/recovery.js");
const timer1_supervisor_ts_1 = require("./kernel/timer1-supervisor.js");
const deferred_worker_ts_1 = require("./kernel/deferred-worker.js");
const foreground_executive_ts_1 = require("./kernel/foreground-executive.js");
const interrupt_service_ts_1 = require("./kernel/interrupt-service.js");
const ecu_services_ts_1 = require("./ecu-services.js");
const ecu_subsystems_ts_1 = require("./ecu-subsystems.js");
const speed_estimate_ts_1 = require("./subsystems/speed-estimate.js");
class Ecu {
    machine;
    context;
    parts;
    supervisor;
    deferred;
    executive;
    restarts = [];
    counters = { external1: 0, stubs: 0 };
    dispatch;
    foregroundDebt = 0;
    started = false;
    constructor(options = {}) {
        const assumptions = { ...assumptions_ts_1.DEFAULT_ASSUMPTIONS, ...options.assumptions };
        this.machine = new machine_ts_1.Machine(assumptions);
        const calibration = (0, calibration_image_ts_1.buildCalibrationImage)();
        this.context = {
            machine: this.machine,
            calibration,
            lookup: new lookup_service_ts_1.LookupService(this.machine.idata, calibration),
            assumptions,
            reportFault: (identifier, subtype, a, b) => void this.parts.faults.report(identifier, subtype, a, b),
            restart: (reason) => this.restart(reason),
        };
        this.parts = (0, ecu_subsystems_ts_1.buildSubsystems)(this.context);
        this.supervisor = new timer1_supervisor_ts_1.Timer1Supervisor(this.machine, (reason) => this.restart(reason));
        this.deferred = new deferred_worker_ts_1.DeferredWorker(this.machine, {
            adc: () => this.parts.adc.scan(),
            timing: () => this.parts.sync.checkTimeout(),
            state: () => this.parts.load.update(),
            serial: () => this.parts.session.service(),
        });
        this.dispatch = (0, interrupt_service_ts_1.createInterruptDispatcher)(this.machine, {
            ext0: () => this.deferred.run(),
            timer1: () => this.supervisor.service(),
            serial: () => this.parts.uart.onSerialInterrupt(),
            ext3cc0: () => this.parts.sync.onCaptureInterrupt(),
            timer2: () => this.parts.capture.onTimer2Overflow(),
        }, this.counters);
        this.executive = new foreground_executive_ts_1.ForegroundExecutive((0, ecu_services_ts_1.buildForegroundServices)(this.parts), () => this.housekeeping(), () => this.supervisor.kick());
        this.machine.onWatchdogExpiry = () => this.restart('watchdog');
    }
    /** Power-on: the proven reset trace, then initialisation. */
    powerOn() {
        this.machine.powerOnReset();
        const reset = (0, reset_ts_1.runReset)(this.machine);
        const startup = this.initialise('power-on');
        this.started = true;
        return { ...reset, ...startup };
    }
    initialise(reason) {
        const outcome = (0, startup_ts_1.runStartup)(this.machine, reason);
        this.supervisor.initialise();
        for (const part of this.parts.initialisable)
            part.initialise();
        return outcome;
    }
    /** CODE:2564 -> 5c00, or the serial timeout path, or the watchdog. */
    restart(reason) {
        this.restarts.push(reason);
        (0, recovery_ts_1.runRecovery)(this.machine, reason, () => this.parts.adc.scan());
        this.initialise(reason);
        this.machine.watchdog.start();
    }
    /** CODE:6096 — housekeeping, called between every pair of services. */
    housekeeping() {
        this.machine.watchdog.refresh();
        this.parts.sync.checkTimeout();
    }
    /** Advance time, servicing interrupts and running foreground cycles. */
    step(ticks) {
        if (!this.started)
            throw new Error('powerOn() must run before step()');
        const cyclePeriod = (0, assumptions_ts_1.msToTicks)(this.context.assumptions, this.context.assumptions.foregroundCycleMs);
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
    runFor(milliseconds) {
        this.step((0, assumptions_ts_1.msToTicks)(this.context.assumptions, milliseconds));
    }
    /** Bench input: one external-3/CC0 capture event. */
    crankEvent() {
        this.machine.pend('ext3cc0');
        this.machine.interrupts.serviceAll(this.dispatch);
    }
    /** Bench input: spin the crank at a speed for a while. */
    spinCrank(rpm, milliseconds) {
        const period = (0, speed_estimate_ts_1.periodForRpm)(this.context.assumptions, rpm);
        if (period <= 0)
            return;
        const total = (0, assumptions_ts_1.msToTicks)(this.context.assumptions, milliseconds);
        // Advance by whole capture periods, then run out the remainder, so the
        // clock lands exactly on the requested duration instead of overshooting by
        // up to one period.
        let elapsed = 0;
        while (elapsed + period <= total) {
            this.step(period);
            this.crankEvent();
            elapsed += period;
        }
        if (elapsed < total)
            this.step(total - elapsed);
    }
    /** Bench input: drive an ADC channel. */
    setAnalogInput(channel, raw) {
        this.machine.adc.setInput(channel, raw);
    }
    /** Bench input: a diagnostic byte from the tester. */
    receiveDiagnosticByte(byte) {
        this.machine.serial.enableInterrupt(true);
        this.machine.serial.deliver(byte);
        this.machine.interrupts.serviceAll(this.dispatch);
    }
    interruptCounts() {
        const counts = {
            external1Wrappers: this.counters.external1,
            stubWrappers: this.counters.stubs,
        };
        for (const [source, count] of this.machine.interrupts.counts)
            counts[source] = count;
        return counts;
    }
}
exports.Ecu = Ecu;
const createEcu = (options = {}) => new Ecu(options);
exports.createEcu = createEcu;
