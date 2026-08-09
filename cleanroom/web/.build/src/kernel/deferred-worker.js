"use strict";
/**
 * The software-pended INT0 chain.
 *
 * "INT0 is software-pended by 25f8-2605; its worker chain 2606-3356 performs
 * deferred ADC, timing, state, and serial work, then clears EX0."
 *
 * This is the firmware's deferred-work mechanism: a foreground or interrupt
 * context that wants heavy work done later raises INT0 in software, and the
 * chain runs it at interrupt priority, disarming itself on the way out. The
 * four job categories are the specification's; what each one does is supplied
 * by the caller.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeferredWorker = void 0;
const memory_map_ts_1 = require("../memory-map.js");
/** Run order within the chain. */
const ORDER = ['adc', 'timing', 'state', 'serial'];
class DeferredWorker {
    runs = 0;
    pending = false;
    machine;
    jobs;
    constructor(machine, jobs) {
        this.machine = machine;
        this.jobs = jobs;
    }
    /** CODE:25f8-2605 — software-pend INT0. */
    request() {
        this.pending = true;
        this.machine.interrupts.setEnabled('ext0', true);
        this.machine.interrupts.pend('ext0');
    }
    isPending() {
        return this.pending;
    }
    /** CODE:2606-3356 — the worker chain. Clears EX0 when the chain completes. */
    run() {
        this.pending = false;
        for (const category of ORDER)
            this.jobs[category]();
        this.runs += 1;
        // Clearing IEN0.EX0 disarms the software interrupt until the next request.
        this.machine.interrupts.setEnabled('ext0', false);
        this.machine.sfr.setBit(memory_map_ts_1.SFR.IEN0, memory_map_ts_1.SFR_BITS.IEN0_EX0, false);
    }
}
exports.DeferredWorker = DeferredWorker;
