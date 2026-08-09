"use strict";
/**
 * ROM checksum and RAM test.
 *
 * The checksum is the most completely proven algorithm in the whole
 * specification, so it is reproduced exactly. CODE:9016 "initializes R1:R0 to
 * zero, starts DPTR=0000, reads each byte with MOVC, accumulates modulo 65536,
 * and loops until DPTR=9f00. It then compares CODE:9f00 with high accumulator
 * R1 and 9f01 with low accumulator R0. There is no seed, complement, CRC, or
 * word summation." Failure records identifier 4532 with subtype 4.
 *
 * CODE:90f5 "destructively tests XRAM page-0 offsets ff down through 01 with
 * 0x55 and 0xaa, stopping on the first mismatch and reporting the 4532
 * identifier with subtype 1." Offset 0 is excluded by the specification's own
 * bounds, and this model honours that.
 *
 * SPECS also records that "The XDF checksum declaration at physical 0x7ffd
 * points to erased ffff bytes and is not credible for this image" — so the only
 * checksum location this model knows is 9f00.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChunkedChecksum = exports.IntegrityChecks = void 0;
const memory_map_ts_1 = require("../memory-map.js");
const fault_monitors_ts_1 = require("./fault-monitors.js");
/** Test patterns, in the order CODE:90f5 applies them. */
const PATTERNS = [0x55, 0xaa];
class IntegrityChecks {
    context;
    constructor(context) {
        this.context = context;
    }
    /** CODE:9016. Accumulates the whole coverage range in one call; a chunked
     *  variant exists below for the foreground cycle. */
    verifyChecksum() {
        const { rom } = this.context.machine;
        let accumulator = 0;
        for (let address = 0; address < memory_map_ts_1.CODE.checksumCoverageEnd; address += 1) {
            accumulator = (accumulator + rom[address]) & 0xffff;
        }
        const stored = (rom[memory_map_ts_1.CODE.checksumWord] << 8) | rom[memory_map_ts_1.CODE.checksumWord + 1];
        const passed = accumulator === stored;
        if (!passed) {
            this.context.reportFault(fault_monitors_ts_1.FAULT_TABLE_IDENTIFIER, fault_monitors_ts_1.SUBTYPE.romChecksum, (accumulator >> 8) & 0xff, accumulator & 0xff);
        }
        return { computed: accumulator, stored, passed };
    }
    /** The invariant the specification states outright, checked independently of
     *  the stored word. */
    checksumMatchesSpecification() {
        return this.verifyChecksum().computed === memory_map_ts_1.ROM_CHECKSUM;
    }
    /**
     * CODE:90f5 — destructive page-0 RAM test, ff down through 01.
     *
     * It is destructive by design; the caller runs it before the runtime state it
     * would clobber exists, which is why startup is the only place it belongs.
     */
    testRam() {
        const { xram } = this.context.machine;
        for (let offset = 0xff; offset >= 0x01; offset -= 1) {
            for (const pattern of PATTERNS) {
                xram.write(offset, pattern);
                if (xram.read(offset) !== pattern) {
                    this.context.reportFault(fault_monitors_ts_1.FAULT_TABLE_IDENTIFIER, fault_monitors_ts_1.SUBTYPE.ramTest, offset, pattern);
                    return { passed: false, failedOffset: offset };
                }
            }
            xram.write(offset, 0);
        }
        return { passed: true, failedOffset: null };
    }
}
exports.IntegrityChecks = IntegrityChecks;
/** Chunked checksum state, so the foreground cycle can verify across passes
 *  without stalling. The algorithm is unchanged; only the loop is split. */
class ChunkedChecksum {
    address = 0;
    accumulator = 0;
    lastResult = null;
    integrity;
    rom;
    bytesPerPass;
    constructor(integrity, rom, bytesPerPass = 512) {
        this.integrity = integrity;
        this.rom = rom;
        this.bytesPerPass = bytesPerPass;
    }
    /** Returns true when a full pass completed. */
    step() {
        const end = Math.min(memory_map_ts_1.CODE.checksumCoverageEnd, this.address + this.bytesPerPass);
        for (; this.address < end; this.address += 1) {
            this.accumulator = (this.accumulator + this.rom[this.address]) & 0xffff;
        }
        if (this.address < memory_map_ts_1.CODE.checksumCoverageEnd)
            return false;
        const stored = (this.rom[memory_map_ts_1.CODE.checksumWord] << 8) | this.rom[memory_map_ts_1.CODE.checksumWord + 1];
        this.lastResult = {
            computed: this.accumulator,
            stored,
            passed: this.accumulator === stored ? 1 : 0,
        };
        if (this.accumulator !== stored)
            this.integrity.verifyChecksum();
        this.address = 0;
        this.accumulator = 0;
        return true;
    }
}
exports.ChunkedChecksum = ChunkedChecksum;
