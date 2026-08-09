"use strict";
/**
 * Interrupt controller.
 *
 * The specification names three enable bits and one flag: IEN0.EA (cleared by
 * the recovery path at CODE:2564), IEN0.EX0 (cleared by the deferred worker
 * when its chain completes), IEN1.SWDT, and IRCON.TF2 (cleared by the timer-2
 * wrapper). Those live in the register image. Per-source enables that the
 * specification does not locate are held here and documented as model-local.
 *
 * Priority follows vector order, which is the part's behaviour for equal
 * priority levels. SPECS observes the priority state at SFR:00a9 but only
 * proves the WDTS bit inside it, so no priority-group logic is invented.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.InterruptController = void 0;
const memory_map_ts_1 = require("../memory-map.js");
const vector_table_ts_1 = require("../kernel/vector-table.js");
class InterruptController {
    pending = new Set();
    enabled = new Map();
    /** Nesting guard: a handler that pends another source is serviced after. */
    servicing = false;
    counts = new Map();
    sfr;
    constructor(sfr) {
        this.sfr = sfr;
        for (const entry of vector_table_ts_1.VECTOR_TABLE)
            this.enabled.set(entry.source, false);
    }
    globalEnable(on) {
        this.sfr.setBit(memory_map_ts_1.SFR.IEN0, memory_map_ts_1.SFR_BITS.IEN0_EA, on);
    }
    isGloballyEnabled() {
        return this.sfr.getBit(memory_map_ts_1.SFR.IEN0, memory_map_ts_1.SFR_BITS.IEN0_EA);
    }
    setEnabled(source, on) {
        this.enabled.set(source, on);
        if (source === 'ext0')
            this.sfr.setBit(memory_map_ts_1.SFR.IEN0, memory_map_ts_1.SFR_BITS.IEN0_EX0, on);
    }
    isEnabled(source) {
        if (source === 'ext0')
            return this.sfr.getBit(memory_map_ts_1.SFR.IEN0, memory_map_ts_1.SFR_BITS.IEN0_EX0);
        return this.enabled.get(source) === true;
    }
    /** Hardware or software request. INT0 is software-pended by CODE:25f8-2605,
     *  which is why this is not restricted to peripheral callers. */
    pend(source) {
        this.pending.add(source);
    }
    isPending(source) {
        return this.pending.has(source);
    }
    clear(source) {
        this.pending.delete(source);
    }
    clearAll() {
        this.pending.clear();
    }
    /** Highest-priority pending source that is enabled, or null. */
    next() {
        if (!this.isGloballyEnabled())
            return null;
        for (const entry of vector_table_ts_1.VECTOR_TABLE) {
            if (this.pending.has(entry.source) && this.isEnabled(entry.source))
                return entry.source;
        }
        return null;
    }
    /** Service everything currently deliverable. Returns how many ran. */
    serviceAll(handler, limit = 64) {
        if (this.servicing)
            return 0;
        this.servicing = true;
        let serviced = 0;
        try {
            for (let i = 0; i < limit; i += 1) {
                const source = this.next();
                if (source === null)
                    break;
                this.pending.delete(source);
                this.counts.set(source, (this.counts.get(source) ?? 0) + 1);
                handler(source);
                serviced += 1;
            }
        }
        finally {
            this.servicing = false;
        }
        return serviced;
    }
    reset() {
        this.pending.clear();
        this.counts.clear();
        for (const entry of vector_table_ts_1.VECTOR_TABLE)
            this.enabled.set(entry.source, false);
        this.globalEnable(false);
    }
}
exports.InterruptController = InterruptController;
