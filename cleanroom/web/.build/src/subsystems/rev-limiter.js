"use strict";
/**
 * Staged rev cut, CODE:27cc.
 *
 * Proven: 27cc consumes the primary record — `2909-291f` reads record fields
 * through offset 0x11 (42d5) and `2ad9-2ade` selects offset 0x12 (42d6) into
 * INTMEM:0052 — and owns BITS:0038 (`rev_cut_stage_active`), complementary
 * BITS:003a, and the transition countdown at INTMEM:0052. CODE:3530
 * independently copies 42d0-42d2 into XRAM 0207-0209. No direct access to the
 * secondary 4313/4314 pair is recovered, so this model reads only the primary.
 *
 * The RPM conversion (`912500 / 0x90 = 6336.8`) and the staged-injector-cut
 * narrative are XDF claims, graded Low by SPECS, and "the full chain from these
 * latches to a physical injector or ignition output has not been uniquely
 * proven". This model does wire the latch to fuel suppression — it has to do
 * something — and marks that edge as the unproven one.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RevLimiter = void 0;
const memory_map_ts_1 = require("../memory-map.js");
const rev_limit_record_ts_1 = require("../calibration/rev-limit-record.js");
class RevLimiter {
    limitRpm = 0;
    resumeRpm = 0;
    context;
    sync;
    constructor(context, sync) {
        this.context = context;
        this.sync = sync;
    }
    /** Read the primary record, and perform the CODE:3530 copy. */
    initialise() {
        const { calibration, machine, assumptions } = this.context;
        const record = (0, rev_limit_record_ts_1.readRevLimitRecord)((a) => calibration.read(a), rev_limit_record_ts_1.REV_LIMIT.primaryRecordBase);
        this.limitRpm = record.limit === 0 ? 0 : assumptions.revLimitNumerator / record.limit;
        this.resumeRpm = this.limitRpm - record.buffer * assumptions.rpmPerBufferCount;
        // CODE:2ad9-2ade — the buffer byte lands in INTMEM:0052.
        machine.idata.write(memory_map_ts_1.IDATA.revCutCountdown, record.buffer);
        machine.idata.setBit(memory_map_ts_1.BITS.revCutStageActive, false);
        machine.idata.setBit(memory_map_ts_1.BITS.revCutStageComplement, true);
        // CODE:3530 — copy 42d0-42d2 into XRAM 0207-0209.
        for (let i = 0; i < rev_limit_record_ts_1.REV_LIMIT.copyLength; i += 1) {
            machine.xram.write(memory_map_ts_1.XRAM.revLimitCopyBase + i, calibration.read(rev_limit_record_ts_1.REV_LIMIT.copySourceBase + i));
        }
    }
    /** Called from the foreground cycle. */
    update() {
        const { idata } = this.context.machine;
        const rpm = this.sync.speed()?.rpm ?? 0;
        const active = idata.getBit(memory_map_ts_1.BITS.revCutStageActive);
        if (!active) {
            if (rpm >= this.limitRpm && this.limitRpm > 0) {
                idata.setBit(memory_map_ts_1.BITS.revCutStageActive, true);
                idata.setBit(memory_map_ts_1.BITS.revCutStageComplement, false);
                idata.write(memory_map_ts_1.IDATA.revCutCountdown, this.bufferByte());
            }
            return;
        }
        if (rpm > this.resumeRpm) {
            // Still above the release point: hold the stage and reload the countdown.
            idata.write(memory_map_ts_1.IDATA.revCutCountdown, this.bufferByte());
            return;
        }
        const { expired } = idata.decrementToZero(memory_map_ts_1.IDATA.revCutCountdown);
        if (!expired)
            return;
        idata.setBit(memory_map_ts_1.BITS.revCutStageActive, false);
        idata.setBit(memory_map_ts_1.BITS.revCutStageComplement, true);
    }
    bufferByte() {
        return this.context.calibration.read(rev_limit_record_ts_1.REV_LIMIT.primaryRecordBase + rev_limit_record_ts_1.REV_LIMIT.bufferOffset);
    }
    isCutting() {
        return this.context.machine.idata.getBit(memory_map_ts_1.BITS.revCutStageActive);
    }
    state() {
        const { idata } = this.context.machine;
        return {
            cutStageActive: idata.getBit(memory_map_ts_1.BITS.revCutStageActive),
            cutStageComplement: idata.getBit(memory_map_ts_1.BITS.revCutStageComplement),
            countdown: idata.read(memory_map_ts_1.IDATA.revCutCountdown),
            limitRpm: this.limitRpm,
            resumeRpm: this.resumeRpm,
        };
    }
    /** The raw record values, which is all SPECS is willing to assert. */
    rawRecords() {
        const read = (a) => this.context.calibration.read(a);
        return [
            { ...(0, rev_limit_record_ts_1.readRevLimitRecord)(read, rev_limit_record_ts_1.REV_LIMIT.primaryRecordBase), consumed: true },
            { ...(0, rev_limit_record_ts_1.readRevLimitRecord)(read, rev_limit_record_ts_1.REV_LIMIT.secondaryRecordBase), consumed: false },
        ];
    }
}
exports.RevLimiter = RevLimiter;
