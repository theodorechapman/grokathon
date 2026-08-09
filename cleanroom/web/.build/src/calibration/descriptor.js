"use strict";
/**
 * Calibration descriptor format.
 *
 * Proven structure, from SPECS:
 *  - "Calibration descriptors name their input by an 8051 direct-data address";
 *  - "CODE:046a-0473 loads the descriptor's first byte into R0, then reads @R0
 *     as the live axis value";
 *  - "Descriptor axes are cumulative byte deltas";
 *  - "Two-axis selectors cause the same operation on the second descriptor
 *     axis".
 *
 * So a descriptor is: input address, point count, cumulative deltas, and — for
 * a two-axis descriptor — the same triple again, followed by the payload. The
 * dimension flag is not inside the descriptor; it arrives from the master
 * directory, which is why `decodeDescriptor` takes it as an argument.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeDescriptor = exports.decodeDescriptor = void 0;
const byte_math_ts_1 = require("../byte-math.js");
const decodeAxis = (image, cursor) => {
    const inputAddress = image[cursor];
    const count = image[cursor + 1];
    if (count === 0)
        throw new Error(`descriptor axis at ${cursor.toString(16)} has no points`);
    const points = [];
    let value = 0;
    for (let i = 0; i < count; i += 1) {
        value = (0, byte_math_ts_1.u8)(value + image[cursor + 2 + i]);
        points.push(value);
    }
    return { axis: { inputAddress, points }, next: cursor + 2 + count };
};
const decodeDescriptor = (image, address, twoAxis) => {
    const first = decodeAxis(image, address);
    const axes = [first.axis];
    let cursor = first.next;
    if (twoAxis) {
        const second = decodeAxis(image, cursor);
        axes.push(second.axis);
        cursor = second.next;
    }
    const rows = axes[0].points.length;
    const columns = twoAxis ? axes[1].points.length : 1;
    return {
        address,
        axes,
        rows,
        columns,
        payload: image.slice(cursor, cursor + rows * columns),
    };
};
exports.decodeDescriptor = decodeDescriptor;
/** Inverse of `decodeDescriptor`, used to lay a calibration image down. */
const encodeDescriptor = (spec) => {
    const out = [];
    for (const axis of spec.axes) {
        out.push((0, byte_math_ts_1.u8)(axis.inputAddress), (0, byte_math_ts_1.u8)(axis.points.length));
        let previous = 0;
        for (const point of axis.points) {
            out.push((0, byte_math_ts_1.u8)(point - previous));
            previous = point;
        }
    }
    const expected = spec.axes.reduce((n, a) => n * a.points.length, 1);
    if (spec.values.length !== expected) {
        throw new Error(`descriptor payload is ${spec.values.length} bytes, expected ${expected}`);
    }
    for (const value of spec.values)
        out.push((0, byte_math_ts_1.u8)(value));
    return Uint8Array.from(out);
};
exports.encodeDescriptor = encodeDescriptor;
