"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInterruptDispatcher = void 0;
const memory_map_ts_1 = require("../memory-map.js");
const vector_table_ts_1 = require("./vector-table.js");
const createInterruptDispatcher = (machine, workers, counters) => {
    const stubs = new Set(vector_table_ts_1.STUB_SOURCES);
    return (source) => {
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
                const low = machine.idata.increment(memory_map_ts_1.IDATA.interruptCounterHigh);
                if (low === 0)
                    machine.idata.increment(memory_map_ts_1.IDATA.interruptCounterLow);
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
exports.createInterruptDispatcher = createInterruptDispatcher;
