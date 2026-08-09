"use strict";
/**
 * Timer 1, 16-bit with a software reload.
 *
 * The specification proves the reload is performed by the handler rather than
 * by hardware: the timer-1 worker at CODE:257d "refreshes the watchdog, reloads
 * TH1/TL1, raises BITS:002d, and decrements heartbeat INTMEM:0068". So this
 * model overflows and stops contributing until the handler reloads it.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Timer1 = void 0;
const memory_map_ts_1 = require("../memory-map.js");
class Timer1 {
    counter = 0;
    sfr;
    onOverflow;
    constructor(sfr, onOverflow) {
        this.sfr = sfr;
        this.onOverflow = onOverflow;
    }
    /** Write TH1:TL1 and restart counting from that value. */
    reload(value) {
        this.counter = value & 0xffff;
        this.sfr.write(memory_map_ts_1.SFR.TH1, (this.counter >> 8) & 0xff);
        this.sfr.write(memory_map_ts_1.SFR.TL1, this.counter & 0xff);
    }
    /** Reload derived from a desired period: the timer counts up to overflow. */
    reloadForPeriod(ticks) {
        this.reload(0x10000 - Math.max(1, Math.min(0x10000, Math.round(ticks))));
    }
    value() {
        return this.counter;
    }
    advance(ticks) {
        let remaining = ticks;
        while (remaining > 0) {
            const toOverflow = 0x10000 - this.counter;
            if (remaining < toOverflow) {
                this.counter += remaining;
                remaining = 0;
            }
            else {
                remaining -= toOverflow;
                this.counter = 0;
                this.sfr.write(memory_map_ts_1.SFR.TH1, 0);
                this.sfr.write(memory_map_ts_1.SFR.TL1, 0);
                this.onOverflow();
                // Without a handler reload the timer keeps rolling from zero; the
                // supervisor's job is to reload it, and a missed reload is visible.
            }
        }
        this.sfr.write(memory_map_ts_1.SFR.TH1, (this.counter >> 8) & 0xff);
        this.sfr.write(memory_map_ts_1.SFR.TL1, this.counter & 0xff);
    }
    reset() {
        this.reload(0);
    }
}
exports.Timer1 = Timer1;
