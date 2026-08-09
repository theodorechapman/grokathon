"use strict";
/**
 * Fault memory.
 *
 * Format, proven: "Fault memory is XRAM 0300-03fe, at most 51 records of five
 * bytes: +0 fault identifier; +1 status/class/subtype; +2/+3 snapshots; +4
 * aging counter. XRAM 00ec is the count, 00ed-00f1 is a selected-record cache,
 * and 00f2-00f3 points at the current record."
 *
 * Status bits, proven: "low nibble: monitor-supplied subtype/state; bit 4:
 * ROM-table class property; bit 5: qualified/stored; bit 6: currently active;
 * bit 7: previously active/healed history."
 *
 * Routines: CODE:8e50 creates or updates records, CODE:955c ages inactive
 * records and maintains global fallback timers, CODE:89c4 clears all records,
 * caches, monitor counters and adaptation status 002f.
 *
 * SPECS is explicit that no EEPROM write was recovered: "Adaptation and fault
 * state are XRAM unless external retention hardware proves otherwise." Nothing
 * here persists.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FaultMemory = exports.STATUS_BIT = exports.MAX_RECORDS = exports.RECORD_BYTES = void 0;
const byte_math_ts_1 = require("../byte-math.js");
const memory_map_ts_1 = require("../memory-map.js");
exports.RECORD_BYTES = 5;
exports.MAX_RECORDS = 51;
exports.STATUS_BIT = {
    romTableClass: 4,
    qualifiedStored: 5,
    currentlyActive: 6,
    previouslyActive: 7,
};
const FIELD = { identifier: 0, status: 1, snapshotA: 2, snapshotB: 3, age: 4 };
class FaultMemory {
    xram;
    constructor(xram) {
        this.xram = xram;
    }
    addressOf(index) {
        return memory_map_ts_1.XRAM.faultRecordBase + index * exports.RECORD_BYTES;
    }
    count() {
        return this.xram.read(memory_map_ts_1.XRAM.faultCount);
    }
    read(index) {
        const base = this.addressOf(index);
        return {
            index,
            identifier: this.xram.read(base + FIELD.identifier),
            status: this.xram.read(base + FIELD.status),
            snapshotA: this.xram.read(base + FIELD.snapshotA),
            snapshotB: this.xram.read(base + FIELD.snapshotB),
            age: this.xram.read(base + FIELD.age),
        };
    }
    all() {
        return Array.from({ length: this.count() }, (_, index) => this.read(index));
    }
    find(identifier) {
        for (let index = 0; index < this.count(); index += 1) {
            const record = this.read(index);
            if (record.identifier === identifier)
                return record;
        }
        return null;
    }
    /**
     * CODE:8e50 — create or update. A repeat of an already-stored identifier
     * refreshes it rather than consuming another slot.
     */
    report(identifier, subtype, snapshotA = 0, snapshotB = 0, romTableClass = false) {
        const existing = this.find(identifier);
        const index = existing ? existing.index : this.count();
        if (index >= exports.MAX_RECORDS)
            return null;
        const base = this.addressOf(index);
        const previous = existing ? existing.status : 0;
        let status = (0, byte_math_ts_1.packNibbles)(0, subtype);
        status = (0, byte_math_ts_1.bitWrite)(status, exports.STATUS_BIT.romTableClass, romTableClass);
        status = (0, byte_math_ts_1.bitWrite)(status, exports.STATUS_BIT.qualifiedStored, true);
        status = (0, byte_math_ts_1.bitWrite)(status, exports.STATUS_BIT.currentlyActive, true);
        status = (0, byte_math_ts_1.bitWrite)(status, exports.STATUS_BIT.previouslyActive, existing !== null || (previous & (1 << exports.STATUS_BIT.previouslyActive)) !== 0);
        this.xram.write(base + FIELD.identifier, identifier);
        this.xram.write(base + FIELD.status, status);
        this.xram.write(base + FIELD.snapshotA, snapshotA);
        this.xram.write(base + FIELD.snapshotB, snapshotB);
        this.xram.write(base + FIELD.age, 0);
        if (!existing)
            this.xram.write(memory_map_ts_1.XRAM.faultCount, index + 1);
        this.cache(index);
        return this.read(index);
    }
    /** A monitor reporting that its condition has gone away. */
    clearActive(identifier) {
        const record = this.find(identifier);
        if (!record)
            return;
        const base = this.addressOf(record.index);
        let status = (0, byte_math_ts_1.bitWrite)(record.status, exports.STATUS_BIT.currentlyActive, false);
        status = (0, byte_math_ts_1.bitWrite)(status, exports.STATUS_BIT.previouslyActive, true);
        this.xram.write(base + FIELD.status, status);
    }
    /** CODE:955c — age inactive records; a healed record eventually drops out. */
    age(maximumAge = 40) {
        for (let index = this.count() - 1; index >= 0; index -= 1) {
            const record = this.read(index);
            if ((record.status >> exports.STATUS_BIT.currentlyActive) & 1)
                continue;
            const next = (0, byte_math_ts_1.u8)(record.age + 1);
            this.xram.write(this.addressOf(index) + FIELD.age, next);
            if (next >= maximumAge)
                this.remove(index);
        }
    }
    remove(index) {
        const last = this.count() - 1;
        for (let i = index; i < last; i += 1) {
            const from = this.addressOf(i + 1);
            const to = this.addressOf(i);
            for (let b = 0; b < exports.RECORD_BYTES; b += 1)
                this.xram.write(to + b, this.xram.read(from + b));
        }
        const tail = this.addressOf(last);
        for (let b = 0; b < exports.RECORD_BYTES; b += 1)
            this.xram.write(tail + b, 0);
        this.xram.write(memory_map_ts_1.XRAM.faultCount, last);
    }
    /** XRAM 00ed-00f1 selected-record cache, 00f2-00f3 current-record pointer. */
    cache(index) {
        const base = this.addressOf(index);
        for (let b = 0; b < exports.RECORD_BYTES; b += 1) {
            this.xram.write(memory_map_ts_1.XRAM.faultCacheBase + b, this.xram.read(base + b));
        }
        this.xram.writeWord(memory_map_ts_1.XRAM.faultCursorHigh, base);
    }
    /** CODE:89c4 — clear records, caches, monitor counters and adaptation
     *  status. The adaptation status byte is cleared by the same routine. */
    clearAll() {
        this.xram.fill(memory_map_ts_1.XRAM.faultRecordBase, memory_map_ts_1.XRAM.faultRecordEnd, 0);
        this.xram.write(memory_map_ts_1.XRAM.faultCount, 0);
        for (let b = 0; b < exports.RECORD_BYTES; b += 1)
            this.xram.write(memory_map_ts_1.XRAM.faultCacheBase + b, 0);
        this.xram.writeWord(memory_map_ts_1.XRAM.faultCursorHigh, 0);
        this.xram.write(memory_map_ts_1.XRAM.adaptationStatus, 0);
    }
    subtypeOf(record) {
        return (0, byte_math_ts_1.lowNibble)(record.status);
    }
}
exports.FaultMemory = FaultMemory;
