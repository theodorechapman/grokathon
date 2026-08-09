"use strict";
/**
 * Synthesised calibration content.
 *
 * The specification recovers table *addresses*, *dimensions*, and *input axes*.
 * It does not publish the bytes, and a clean-room model must not contain them.
 * These generators produce monotone, physically sensible surfaces of the right
 * shape so the control path can be exercised end to end.
 *
 * Every byte produced here is synthetic. Nothing downstream should be read as a
 * statement about the real calibration.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.synthesizePayload = exports.spanAxis = void 0;
const byte_math_ts_1 = require("../byte-math.js");
/** Ascending byte breakpoints spanning the full normalized domain. */
const spanAxis = (count, from = 0, to = 0xff) => Array.from({ length: count }, (_, i) => (0, byte_math_ts_1.sat8)(Math.round(from + ((to - from) * i) / Math.max(1, count - 1))));
exports.spanAxis = spanAxis;
const norm = (index, count) => count <= 1 ? 0 : index / (count - 1);
const CELLS = {
    // More fuel with load, slightly less with speed.
    'fuel-base': (r, c) => 40 + 170 * c - 25 * r,
    // Enrichment plateau across the speed axis.
    'fuel-wot': (r) => 205 + 30 * r,
    // Idle fuel falls as speed rises away from the target.
    'fuel-idle': (r) => 150 - 45 * r,
    // Transient enrichment decays with the axis.
    'accel-enrichment': (r) => 200 - 170 * r,
    // Cold enrichment: large when cold (low axis index is the cold end).
    'temperature-enrichment': (r) => 240 - 180 * r,
    // Dead time falls as supply voltage rises.
    'injector-lag': (r) => 190 - 150 * r,
    // Multiplicative trim centred on the neutral byte.
    trim: (r, c) => 0.5 + 0.25 * (c - 0.5) - 0.15 * (r - 0.5),
    // Advance grows with speed, retards under load.
    'ignition-advance': (r, c) => 60 + 150 * r - 60 * c,
    'ignition-idle': (r) => 110 - 40 * r,
    // Dwell shortens as supply voltage rises, lengthens with speed.
    dwell: (r, c) => 200 - 120 * r + 40 * c,
    // Idle target falls as the conditioning load axis falls.
    'idle-target': (r) => 95 - 20 * r,
};
/** Scale factor applied to `trim`, whose natural output is a fraction. */
const TRIM_FULL_SCALE = 0xff;
const synthesizePayload = (shape, rows, columns) => {
    const cell = CELLS[shape];
    const values = [];
    for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < columns; c += 1) {
            const raw = cell(norm(r, rows), norm(c, columns));
            values.push((0, byte_math_ts_1.sat8)(shape === 'trim' ? raw * TRIM_FULL_SCALE : raw));
        }
    }
    return values;
};
exports.synthesizePayload = synthesizePayload;
