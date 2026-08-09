"use strict";
/**
 * The two rev-limit records.
 *
 * SPECS, verbatim:
 *   primary base 42d0, limit byte 42d5 = 0x90, buffer 42d6 = 0x03;
 *   secondary base 430e, limit byte 4313 = 0x90, buffer 4314 = 0x03.
 *   "Their first 18 bytes are identical."
 *   "CODE:27cc directly consumes the primary record: 2909-291f reads record
 *    fields through offset 0x11 (42d5), and 2ad9-2ade selects offset 0x12
 *    (42d6) into INTMEM:0052."
 *
 * Those two statements pin the structure: if 42d5 is at offset 0x11 of the
 * record 27cc walks, that record starts at 0x42c4, and the XDF's "base 42d0"
 * names the visible sub-record. Both bases are kept so consumers can use the
 * one their evidence supports. No direct access to the secondary 4313/4314 pair
 * was recovered, so nothing in this model reads it — it exists and is checked.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.readRevLimitRecord = exports.buildRevLimitRecord = exports.REV_LIMIT = void 0;
exports.REV_LIMIT = {
    /** Record base implied by offset 0x11 pointing at 42d5. */
    primaryRecordBase: 0x42c4,
    /** XDF-declared base; CODE:3530 copies 42d0-42d2 into XRAM 0207-0209. */
    primaryDeclaredBase: 0x42d0,
    primaryLimitAddress: 0x42d5,
    primaryBufferAddress: 0x42d6,
    secondaryRecordBase: 0x4302,
    secondaryDeclaredBase: 0x430e,
    secondaryLimitAddress: 0x4313,
    secondaryBufferAddress: 0x4314,
    /** Field offsets within the record 27cc walks. */
    limitOffset: 0x11,
    bufferOffset: 0x12,
    /** Proven values. */
    limitByte: 0x90,
    bufferByte: 0x03,
    identicalPrefixBytes: 18,
    /** Bytes CODE:3530 copies. */
    copySourceBase: 0x42d0,
    copyLength: 3,
};
/** Deterministic filler for the record body. Only offsets 0x11 and 0x12 carry
 *  proven values; the rest is shape, not content. */
const buildRevLimitRecord = () => {
    const record = new Uint8Array(0x14);
    for (let i = 0; i < record.length; i += 1)
        record[i] = 0x20 + i;
    record[exports.REV_LIMIT.limitOffset] = exports.REV_LIMIT.limitByte;
    record[exports.REV_LIMIT.bufferOffset] = exports.REV_LIMIT.bufferByte;
    return record;
};
exports.buildRevLimitRecord = buildRevLimitRecord;
const readRevLimitRecord = (read, base) => ({
    base,
    limit: read(base + exports.REV_LIMIT.limitOffset),
    buffer: read(base + exports.REV_LIMIT.bufferOffset),
});
exports.readRevLimitRecord = readRevLimitRecord;
