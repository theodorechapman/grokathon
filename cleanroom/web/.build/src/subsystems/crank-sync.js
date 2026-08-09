"use strict";
/**
 * External-3/CC0 dispatch and the compare/capture worker.
 *
 * Proven: `CODE:0053` enters `20a0`, and bit `BITS:0021` selects either
 * `CODE:2462` (the timestamp worker) or `CODE:21d8` ("a larger compare/capture
 * worker that consumes timer/port state and updates event state").
 * `INTMEM:0048` counts capture phases, `INTMEM:004f` points into the timestamp
 * buffer, and state at `004a`, `0071` and bit-addressable RAM controls the
 * alternative worker and synchronization transitions.
 *
 * What the bit *means* is not recovered. This model reads it as the
 * acquired/locked distinction — timestamps while acquiring, scheduling once
 * locked — and marks that as interpretation. SPECS is equally clear that tooth
 * count, missing-tooth pattern and cylinder phase names are not established, so
 * no tooth pattern is decoded here: a capture is a capture.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CrankSync = exports.SYNC_STATE = void 0;
const memory_map_ts_1 = require("../memory-map.js");
const speed_estimate_ts_1 = require("./speed-estimate.js");
exports.SYNC_STATE = { lost: 0, acquiring: 1, locked: 2 };
/** Consecutive plausible periods before the model declares lock. */
const LOCK_THRESHOLD = 4;
/** A period may not grow by more than this factor without breaking lock. */
const PLAUSIBLE_RATIO = 4;
class CrankSync {
    consecutive = 0;
    lastCaptureAt = 0;
    estimate = null;
    /** Loss-of-sync count. SPECS: such counters exist, but no unique
     *  timeout-to-fuel-cut path is proven, so nothing consumes this. */
    lossOfSyncCount = 0;
    context;
    capture;
    /** Called on every capture once locked, to re-arm scheduled outputs. */
    onScheduleWindow;
    constructor(context, capture, onScheduleWindow) {
        this.context = context;
        this.capture = capture;
        this.onScheduleWindow = onScheduleWindow;
    }
    initialise() {
        const { idata } = this.context.machine;
        idata.write(memory_map_ts_1.IDATA.syncState, exports.SYNC_STATE.lost);
        idata.write(memory_map_ts_1.IDATA.captureAltState, 0);
        idata.setBit(memory_map_ts_1.BITS.captureWorkerSelect, false);
        this.consecutive = 0;
        this.estimate = null;
    }
    /** CODE:20a0 — the external-3/CC0 entry. */
    onCaptureInterrupt() {
        const { idata, timer2 } = this.context.machine;
        timer2.capture();
        if (idata.getBit(memory_map_ts_1.BITS.captureWorkerSelect)) {
            this.serviceCompareWorker();
            return;
        }
        this.capture.service();
        this.updateSynchronization();
    }
    /** CODE:21d8 — consumes timer/port state and updates event state. Once
     *  locked, each capture re-opens the scheduling window for the next segment. */
    serviceCompareWorker() {
        const { idata } = this.context.machine;
        this.capture.service();
        idata.increment(memory_map_ts_1.IDATA.captureAltState);
        this.updateSynchronization();
        const period = this.capture.lastPeriod();
        if (period !== null && this.state() === exports.SYNC_STATE.locked)
            this.onScheduleWindow(period);
    }
    updateSynchronization() {
        const { idata, assumptions } = this.context.machine;
        const period = this.capture.lastPeriod();
        this.lastCaptureAt = this.context.machine.now();
        if (period === null || period === 0)
            return;
        const previous = this.estimate;
        const next = (0, speed_estimate_ts_1.estimateSpeed)(assumptions, period);
        if (next === null)
            return;
        const plausible = previous === null ||
            (period <= previous.periodTicks * PLAUSIBLE_RATIO &&
                period * PLAUSIBLE_RATIO >= previous.periodTicks);
        this.estimate = next;
        if (!plausible) {
            this.breakLock();
            return;
        }
        this.consecutive += 1;
        if (this.consecutive >= LOCK_THRESHOLD) {
            idata.write(memory_map_ts_1.IDATA.syncState, exports.SYNC_STATE.locked);
            idata.setBit(memory_map_ts_1.BITS.captureWorkerSelect, true);
        }
        else {
            idata.write(memory_map_ts_1.IDATA.syncState, exports.SYNC_STATE.acquiring);
        }
    }
    /** Called from the foreground cycle: a capture that never arrives. */
    checkTimeout() {
        if (this.state() === exports.SYNC_STATE.lost)
            return;
        const period = this.capture.lastPeriod();
        if (period === null)
            return;
        const since = this.context.machine.now() - this.lastCaptureAt;
        if (since > period * PLAUSIBLE_RATIO)
            this.breakLock();
    }
    breakLock() {
        const { idata } = this.context.machine;
        if (idata.read(memory_map_ts_1.IDATA.syncState) === exports.SYNC_STATE.locked)
            this.lossOfSyncCount += 1;
        this.consecutive = 0;
        this.estimate = null;
        idata.write(memory_map_ts_1.IDATA.syncState, exports.SYNC_STATE.lost);
        idata.setBit(memory_map_ts_1.BITS.captureWorkerSelect, false);
    }
    state() {
        return this.context.machine.idata.read(memory_map_ts_1.IDATA.syncState);
    }
    isLocked() {
        return this.state() === exports.SYNC_STATE.locked;
    }
    speed() {
        return this.estimate;
    }
}
exports.CrankSync = CrankSync;
