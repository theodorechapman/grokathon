"use strict";
/**
 * Byte-domain table interpolation.
 *
 * Three routines are proven: CODE:046a finds the active interval, CODE:0493
 * interpolates between adjacent values, CODE:04a2 does the same on the second
 * axis. SPECS is careful that this proves "table-domain normalization and
 * interpolation, not an analog volts-to-degrees transfer function", so nothing
 * here converts to physical units.
 *
 * Arithmetic is integer throughout: the fraction is a 0..255 numerator and the
 * blend truncates, as an 8051 multiply-and-shift does.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.interpolateDescriptor = exports.blend = exports.locateAxis = void 0;
const byte_math_ts_1 = require("../byte-math.js");
/** CODE:046a — locate the interval containing `value`. */
const locateAxis = (points, value) => {
    const last = points.length - 1;
    if (points.length === 1)
        return { index: 0, fraction: 0, clamped: true };
    if (value <= points[0])
        return { index: 0, fraction: 0, clamped: value < points[0] };
    if (value >= points[last])
        return { index: last - 1, fraction: 0xff, clamped: value > points[last] };
    let index = 0;
    while (index < last - 1 && value >= points[index + 1])
        index += 1;
    const span = points[index + 1] - points[index];
    const fraction = span === 0 ? 0 : Math.trunc(((value - points[index]) * 0x100) / span);
    return { index, fraction: Math.min(0xff, fraction), clamped: false };
};
exports.locateAxis = locateAxis;
/** CODE:0493 — blend two adjacent bytes. */
const blend = (low, high, fraction) => (0, byte_math_ts_1.sat8)((0, byte_math_ts_1.u8)(low) + (((((0, byte_math_ts_1.u8)(high) - (0, byte_math_ts_1.u8)(low)) | 0) * (fraction & 0xff)) >> 8));
exports.blend = blend;
const cell = (descriptor, row, column) => {
    const r = Math.min(row, descriptor.rows - 1);
    const c = Math.min(column, descriptor.columns - 1);
    return descriptor.payload[r * descriptor.columns + c];
};
/**
 * Evaluate a descriptor against live axis values. One axis uses 0493 alone;
 * two axes apply 0493 on each row and 04a2 across the result.
 */
const interpolateDescriptor = (descriptor, axisValues) => {
    const first = (0, exports.locateAxis)(descriptor.axes[0].points, axisValues[0] ?? 0);
    if (descriptor.axes.length === 1) {
        const value = (0, exports.blend)(cell(descriptor, first.index, 0), cell(descriptor, first.index + 1, 0), first.fraction);
        return { value, first, second: null };
    }
    const second = (0, exports.locateAxis)(descriptor.axes[1].points, axisValues[1] ?? 0);
    const lowRow = (0, exports.blend)(cell(descriptor, first.index, second.index), cell(descriptor, first.index, second.index + 1), second.fraction);
    const highRow = (0, exports.blend)(cell(descriptor, first.index + 1, second.index), cell(descriptor, first.index + 1, second.index + 1), second.fraction);
    return { value: (0, exports.blend)(lowRow, highRow, first.fraction), first, second };
};
exports.interpolateDescriptor = interpolateDescriptor;
