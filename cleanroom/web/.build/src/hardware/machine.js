"use strict";
/**
 * The SAB80C515 model: memory, registers, peripherals, and one clock.
 *
 * Time is measured in Timer-2 input clock ticks. SPECS: "Unknown: oscillator
 * frequency, absolute tick periods", so the tick-to-second conversion lives in
 * `Assumptions` and nothing here depends on it.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Machine = exports.MAX_RETAINED_EVENTS = void 0;
const assumptions_ts_1 = require("../assumptions.js");
const rom_image_ts_1 = require("../rom-image.js");
const adc_unit_ts_1 = require("./adc-unit.js");
const digital_ports_ts_1 = require("./digital-ports.js");
const external_memory_ts_1 = require("./external-memory.js");
const internal_memory_ts_1 = require("./internal-memory.js");
const interrupt_controller_ts_1 = require("./interrupt-controller.js");
const serial_port_ts_1 = require("./serial-port.js");
const sfr_file_ts_1 = require("./sfr-file.js");
const timer1_ts_1 = require("./timer1.js");
const timer2_ts_1 = require("./timer2.js");
const watchdog_ts_1 = require("./watchdog.js");
/** Output events retained for inspection. Older ones are discarded. */
exports.MAX_RETAINED_EVENTS = 8192;
class Machine {
    sfr = new sfr_file_ts_1.SfrFile();
    idata = new internal_memory_ts_1.InternalMemory();
    xram = new external_memory_ts_1.ExternalMemory();
    interrupts = new interrupt_controller_ts_1.InterruptController(this.sfr);
    ports = new digital_ports_ts_1.DigitalPorts(this.sfr);
    adc = new adc_unit_ts_1.AdcUnit(this.sfr);
    timer2;
    timer1;
    serial;
    watchdog;
    /** Code space, used by the checksum routine and the code-read service. */
    rom = (0, rom_image_ts_1.buildRomImage)();
    events = [];
    clock = 0;
    /** Set by the ECU: what a watchdog expiry does. Left as a hook because SPECS
     *  does not resolve whether an external watchdog also resets the processor. */
    onWatchdogExpiry = () => { };
    assumptions;
    constructor(assumptions) {
        this.assumptions = assumptions;
        this.timer2 = new timer2_ts_1.Timer2(this.sfr, () => this.interrupts.pend('timer2'));
        this.timer1 = new timer1_ts_1.Timer1(this.sfr, () => this.interrupts.pend('timer1'));
        this.serial = new serial_port_ts_1.SerialPort(this.sfr, () => this.interrupts.pend('serial'), Math.max(1, Math.round(((0, assumptions_ts_1.timerClockHz)(assumptions) * 10) / assumptions.kw71BaudRate)));
        this.watchdog = new watchdog_ts_1.Watchdog(this.sfr, (0, assumptions_ts_1.msToTicks)(assumptions, assumptions.watchdogTimeoutMs), () => this.onWatchdogExpiry());
    }
    now() {
        return this.clock;
    }
    ms() {
        return (this.clock * 1000) / (0, assumptions_ts_1.timerClockHz)(this.assumptions);
    }
    /** Advance every peripheral. Compare and overflow events fire inside
     *  `timer2.advance`, in time order, before this returns. */
    advance(ticks) {
        if (ticks <= 0)
            return;
        this.clock += ticks;
        this.timer2.advance(ticks);
        this.timer1.advance(ticks);
        this.serial.advance(ticks);
        this.watchdog.advance(ticks);
    }
    emit(event) {
        this.events.push({ ...event, at: event.at ?? this.clock });
        // The log is a diagnostic tail, not a record of everything that ever
        // happened: a running engine emits thousands of events per second, and an
        // unbounded array is a leak in any host that runs longer than an example.
        if (this.events.length > exports.MAX_RETAINED_EVENTS) {
            this.events.splice(0, this.events.length - exports.MAX_RETAINED_EVENTS);
        }
    }
    pend(source) {
        this.interrupts.pend(source);
    }
    /** Cold start. Retained XRAM is deliberately *not* cleared here: the startup
     *  routine's job is to decide, from its markers, whether the retained state
     *  is trustworthy. */
    powerOnReset() {
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
exports.Machine = Machine;
