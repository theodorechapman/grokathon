"use strict";
/**
 * Watchdog.
 *
 * Proven: reset copies IP0.6 (WDTS, the watchdog reset status) into PSW.F0 and
 * sets IEN1.SWDT before entering initialisation; the timer-1 worker refreshes
 * the watchdog every reload.
 *
 * SPECS: "No direct WDTREL reference was recovered, so a specific watchdog
 * timeout equation is not claimed." The timeout here is an assumption, supplied
 * from `Assumptions.watchdogTimeoutMs`. Whether an external watchdog also
 * resets the processor is likewise unresolved and is not modelled.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Watchdog = void 0;
const memory_map_ts_1 = require("../memory-map.js");
class Watchdog {
    remaining;
    running = false;
    refreshes = 0;
    expiries = 0;
    sfr;
    timeoutTicks;
    onExpiry;
    constructor(sfr, timeoutTicks, onExpiry) {
        this.sfr = sfr;
        this.timeoutTicks = timeoutTicks;
        this.onExpiry = onExpiry;
        this.remaining = timeoutTicks;
    }
    /** IEN1.SWDT — start (and, on a running watchdog, refresh). */
    start() {
        this.sfr.setBit(memory_map_ts_1.SFR.IEN1, memory_map_ts_1.SFR_BITS.IEN1_SWDT, true);
        this.running = true;
        this.remaining = this.timeoutTicks;
    }
    refresh() {
        if (!this.running)
            return;
        this.remaining = this.timeoutTicks;
        this.refreshes += 1;
    }
    isRunning() {
        return this.running;
    }
    remainingTicks() {
        return this.remaining;
    }
    /** Reset status bit read by the startup sequence. */
    setResetStatus(on) {
        this.sfr.setBit(memory_map_ts_1.SFR.IP0, memory_map_ts_1.SFR_BITS.IP0_WDTS, on);
    }
    resetStatus() {
        return this.sfr.getBit(memory_map_ts_1.SFR.IP0, memory_map_ts_1.SFR_BITS.IP0_WDTS);
    }
    advance(ticks) {
        if (!this.running)
            return;
        this.remaining -= ticks;
        if (this.remaining > 0)
            return;
        this.expiries += 1;
        this.running = false;
        this.remaining = this.timeoutTicks;
        this.setResetStatus(true);
        this.onExpiry();
    }
    stop() {
        this.running = false;
        this.sfr.setBit(memory_map_ts_1.SFR.IEN1, memory_map_ts_1.SFR_BITS.IEN1_SWDT, false);
    }
}
exports.Watchdog = Watchdog;
