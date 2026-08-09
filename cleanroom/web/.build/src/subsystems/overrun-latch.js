"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.OverrunLatch = void 0;
const memory_map_ts_1 = require("../memory-map.js");
/** Model thresholds, byte/engineering domain. Not firmware values. */
const QUALIFY = {
    minimumRpm: 1500,
    maximumLoad: 0x18,
    minimumCoolant: 0x40,
    /** Foreground passes the condition must hold before the latch sets. */
    debounce: 4,
};
class OverrunLatch {
    context;
    load;
    sync;
    constructor(context, load, sync) {
        this.context = context;
        this.load = load;
        this.sync = sync;
    }
    initialise() {
        const { idata } = this.context.machine;
        idata.setBit(memory_map_ts_1.BITS.overrunActive, false);
        idata.write(memory_map_ts_1.IDATA.overrunTimer, 0);
    }
    update() {
        const { idata } = this.context.machine;
        const rpm = this.sync.speed()?.rpm ?? 0;
        const { normalizedLoad } = this.load.comparisonInputs();
        const coolant = idata.read(memory_map_ts_1.IDATA.coolantTemperature);
        const qualified = rpm >= QUALIFY.minimumRpm &&
            normalizedLoad <= QUALIFY.maximumLoad &&
            coolant >= QUALIFY.minimumCoolant;
        if (!qualified) {
            idata.write(memory_map_ts_1.IDATA.overrunTimer, 0);
            idata.setBit(memory_map_ts_1.BITS.overrunActive, false);
            return;
        }
        const elapsed = idata.increment(memory_map_ts_1.IDATA.overrunTimer);
        if (elapsed >= QUALIFY.debounce)
            idata.setBit(memory_map_ts_1.BITS.overrunActive, true);
    }
    isActive() {
        return this.context.machine.idata.getBit(memory_map_ts_1.BITS.overrunActive);
    }
    timer() {
        return this.context.machine.idata.read(memory_map_ts_1.IDATA.overrunTimer);
    }
}
exports.OverrunLatch = OverrunLatch;
