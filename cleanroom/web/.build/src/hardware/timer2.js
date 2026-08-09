"use strict";
/**
 * Timer 2 with the compare/capture unit.
 *
 * This is the spine of the engine-timing subsystems. The specification proves:
 *  - a 16-bit free-running count in TH2:TL2;
 *  - a capture register CRCH:CRCL loaded by the external-3/CC0 event;
 *  - compare channels CC2 and CC3 in active use (no direct CC1 use recovered);
 *  - an overflow epoch byte maintained by the timer-2 interrupt, extending
 *    capture timestamps past the 16-bit boundary.
 *
 * Compare channels are single-shot here: arming schedules one crossing, and the
 * consumer re-arms. That matches "calibrated advance/dwell is converted to
 * timer-domain deadlines, and compare events update output state".
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Timer2 = void 0;
const memory_map_ts_1 = require("../memory-map.js");
/** Distance in ticks from `from` to the next occurrence of `to`, in 1..65536. */
const distance = (from, to) => (((to - from - 1) & 0xffff) + 1);
class Timer2 {
    counter = 0;
    compares = new Map();
    sfr;
    onOverflow;
    constructor(sfr, onOverflow) {
        this.sfr = sfr;
        this.onOverflow = onOverflow;
    }
    value() {
        return this.counter;
    }
    /** Latch the live count into CRCH:CRCL, as the CC0 capture event does. */
    capture() {
        this.sfr.writePair(memory_map_ts_1.SFR.CRCH, memory_map_ts_1.SFR.CRCL, this.counter);
        return { high: this.sfr.read(memory_map_ts_1.SFR.CRCH), low: this.sfr.read(memory_map_ts_1.SFR.CRCL) };
    }
    capturedValue() {
        return this.sfr.readPair(memory_map_ts_1.SFR.CRCH, memory_map_ts_1.SFR.CRCL);
    }
    arm(channel, value, label, action) {
        this.compares.set(channel, { value: value & 0xffff, action, label });
        this.writeCompareRegisters(channel, value & 0xffff);
    }
    disarm(channel) {
        this.compares.delete(channel);
    }
    armed(channel) {
        return this.compares.get(channel)?.value ?? null;
    }
    /** Advance the count, firing overflow and compare events in time order. */
    advance(ticks) {
        if (ticks <= 0)
            return;
        let remaining = ticks;
        while (remaining > 0) {
            const next = this.nextEvent(remaining);
            this.counter = (this.counter + next.step) & 0xffff;
            this.writeCountRegisters();
            remaining -= next.step;
            for (const fire of next.fire)
                fire();
        }
    }
    nextEvent(budget) {
        let step = budget;
        const candidates = [];
        const overflowIn = distance(this.counter, 0);
        if (overflowIn <= budget) {
            step = Math.min(step, overflowIn);
            candidates.push({ at: overflowIn, fire: () => this.onOverflow() });
        }
        for (const [channel, compare] of this.compares) {
            const at = distance(this.counter, compare.value);
            if (at > budget)
                continue;
            step = Math.min(step, at);
            candidates.push({
                at,
                fire: () => {
                    this.compares.delete(channel);
                    compare.action();
                },
            });
        }
        return { step, fire: candidates.filter((c) => c.at === step).map((c) => c.fire) };
    }
    writeCountRegisters() {
        this.sfr.writePair(memory_map_ts_1.SFR.TH2, memory_map_ts_1.SFR.TL2, this.counter);
    }
    writeCompareRegisters(channel, value) {
        const pairs = {
            1: [memory_map_ts_1.SFR.CCH1, memory_map_ts_1.SFR.CCL1],
            2: [memory_map_ts_1.SFR.CCH2, memory_map_ts_1.SFR.CCL2],
            3: [memory_map_ts_1.SFR.CCH3, memory_map_ts_1.SFR.CCL3],
        };
        const [high, low] = pairs[channel];
        this.sfr.writePair(high, low, value);
    }
    reset() {
        this.counter = 0;
        this.compares.clear();
        this.writeCountRegisters();
    }
}
exports.Timer2 = Timer2;
