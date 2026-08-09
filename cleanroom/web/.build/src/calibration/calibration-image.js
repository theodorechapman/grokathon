"use strict";
/**
 * The calibration region, laid out as bytes.
 *
 * Structure the specification proves:
 *  - a 150-entry master directory that pointer windows overlap;
 *  - selector tables that map a logical index to a master slot;
 *  - descriptors whose axis header precedes the XDF-labelled payload address;
 *  - two rev-limit records.
 *
 * The builder asserts the layout is consistent: every descriptor must fit in
 * the gap before the next payload address. That the specification's addresses
 * *can* be laid out with sensible dimensions is itself a check on them.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildCalibrationImage = exports.CalibrationImage = exports.MASTER_DIRECTORY_ENTRIES = exports.MASTER_DIRECTORY_BASE = exports.CALIBRATION_END = exports.CALIBRATION_BASE = void 0;
const payload_catalog_ts_1 = require("./payload-catalog.js");
const rev_limit_record_ts_1 = require("./rev-limit-record.js");
const selector_tables_ts_1 = require("./selector-tables.js");
const descriptor_ts_1 = require("./descriptor.js");
const payload_shapes_ts_1 = require("./payload-shapes.js");
exports.CALIBRATION_BASE = 0x4000;
exports.CALIBRATION_END = 0x6000;
/** SPECS: "the 150-entry master directory". */
exports.MASTER_DIRECTORY_BASE = 0x45c0;
exports.MASTER_DIRECTORY_ENTRIES = 150;
/** Directory entries are a 2-byte descriptor address; the top bit carries the
 *  one/two-axis flag, which the descriptor itself does not encode. */
const TWO_AXIS_FLAG = 0x8000;
const EMPTY_SLOT = 0xffff;
class CalibrationImage {
    bytes = new Uint8Array(exports.CALIBRATION_END - exports.CALIBRATION_BASE).fill(0xff);
    descriptorBases = new Map();
    read(address) {
        return this.bytes[address - exports.CALIBRATION_BASE];
    }
    write(address, value) {
        this.bytes[address - exports.CALIBRATION_BASE] = value & 0xff;
    }
    copyIn(address, data) {
        this.bytes.set(Uint8Array.from(data), address - exports.CALIBRATION_BASE);
    }
    readWord(address) {
        return (this.read(address) << 8) | this.read(address + 1);
    }
    /** Master directory entry for a slot, resolved through a pointer window. */
    directoryEntry(windowBase, slot) {
        const raw = this.readWord(windowBase + slot * 2);
        if (raw === EMPTY_SLOT)
            return null;
        return { base: raw & ~TWO_AXIS_FLAG, twoAxis: (raw & TWO_AXIS_FLAG) !== 0 };
    }
    /** Selector table lookup: logical index to master slot, or 0xff. */
    selector(tableBase, logicalIndex) {
        return this.read(tableBase + logicalIndex);
    }
    descriptorAt(base, twoAxis) {
        return (0, descriptor_ts_1.decodeDescriptor)(this.bytes, base - exports.CALIBRATION_BASE, twoAxis);
    }
    descriptorBaseFor(payloadAddress) {
        const base = this.descriptorBases.get(payloadAddress);
        if (base === undefined)
            throw new Error(`no descriptor for payload ${payloadAddress.toString(16)}`);
        return base;
    }
    registerDescriptor(payloadAddress, base) {
        this.descriptorBases.set(payloadAddress, base);
    }
    snapshot() {
        return this.bytes.slice();
    }
}
exports.CalibrationImage = CalibrationImage;
const place = (entry) => {
    const spec = {
        axes: entry.axes.map((axis) => ({
            inputAddress: axis.inputAddress,
            points: (0, payload_shapes_ts_1.spanAxis)(axis.count),
        })),
        values: (0, payload_shapes_ts_1.synthesizePayload)(entry.shape, entry.axes[0].count, entry.axes[1]?.count ?? 1),
    };
    const encoded = (0, descriptor_ts_1.encodeDescriptor)(spec);
    const headerBytes = encoded.length - spec.values.length;
    const base = entry.payloadAddress - headerBytes;
    if (base < exports.CALIBRATION_BASE) {
        throw new Error(`descriptor for ${entry.payloadAddress.toString(16)} starts below the region`);
    }
    return { entry, base, end: base + encoded.length, encoded };
};
const write = (image, placed) => {
    image.copyIn(placed.base, placed.encoded);
    image.registerDescriptor(placed.entry.payloadAddress, placed.base);
    const flag = placed.entry.axes.length > 1 ? TWO_AXIS_FLAG : 0;
    const address = exports.MASTER_DIRECTORY_BASE + placed.entry.slot * 2;
    image.write(address, ((placed.base | flag) >> 8) & 0xff);
    image.write(address + 1, (placed.base | flag) & 0xff);
};
const buildCalibrationImage = () => {
    const image = new CalibrationImage();
    for (let slot = 0; slot < exports.MASTER_DIRECTORY_ENTRIES; slot += 1) {
        image.write(exports.MASTER_DIRECTORY_BASE + slot * 2, 0xff);
        image.write(exports.MASTER_DIRECTORY_BASE + slot * 2 + 1, 0xff);
    }
    for (const table of selector_tables_ts_1.SELECTOR_TABLES) {
        table.slots.forEach((slot, index) => image.write(table.base + index, slot));
        image.write(table.base + table.slots.length, selector_tables_ts_1.SELECTOR_TERMINATOR);
    }
    const record = (0, rev_limit_record_ts_1.buildRevLimitRecord)();
    image.copyIn(rev_limit_record_ts_1.REV_LIMIT.primaryRecordBase, record);
    image.copyIn(rev_limit_record_ts_1.REV_LIMIT.secondaryRecordBase, record);
    const placed = [...payload_catalog_ts_1.PAYLOAD_CATALOG]
        .sort((a, b) => a.payloadAddress - b.payloadAddress)
        .map(place);
    // A descriptor's header sits below its payload address, so consecutive tables
    // collide unless each one's end clears the next one's base.
    for (let i = 0; i + 1 < placed.length; i += 1) {
        const current = placed[i];
        const next = placed[i + 1];
        if (current.end > next.base) {
            throw new Error(`table ${current.entry.payloadAddress.toString(16)} ends at ${current.end.toString(16)}, ` +
                `overlapping ${next.entry.payloadAddress.toString(16)} whose descriptor starts at ${next.base.toString(16)}`);
        }
    }
    for (const item of placed)
        write(image, item);
    return image;
};
exports.buildCalibrationImage = buildCalibrationImage;
