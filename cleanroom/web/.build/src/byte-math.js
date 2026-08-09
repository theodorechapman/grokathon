"use strict";
/**
 * 8051 arithmetic primitives.
 *
 * Every value the firmware computes is an unsigned byte or a byte pair, and
 * every overflow it tolerates is either a documented wrap or an explicit
 * saturation (SPECS: "state comparisons and saturation prevent byte overflow").
 * These helpers are the only place that truncation happens.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.NEUTRAL = exports.bitWrite = exports.bitGet = exports.bitClear = exports.bitSet = exports.packNibbles = exports.highNibble = exports.lowNibble = exports.timestamp24 = exports.gainQ7 = exports.high8 = exports.clamp = exports.sat8 = exports.s8 = exports.u16 = exports.u8 = void 0;
const u8 = (v) => v & 0xff;
exports.u8 = u8;
const u16 = (v) => v & 0xffff;
exports.u16 = u16;
/** Signed reading of a byte, as an 8051 does with a sign-bit test. */
const s8 = (v) => ((v & 0xff) ^ 0x80) - 0x80;
exports.s8 = s8;
/** Saturating byte clamp, not a wrap. Used wherever the firmware compares
 *  before storing rather than letting a result roll over. */
const sat8 = (v) => (v < 0 ? 0 : v > 0xff ? 0xff : Math.trunc(v));
exports.sat8 = sat8;
const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
exports.clamp = clamp;
/** `high8(a * b)` — the fixed-point product form proven at CODE:3585
 *  (`EXTMEM:006e = high8(calibration_a * calibration_b)`). */
const high8 = (a, b) => (0, exports.u8)(((0, exports.u8)(a) * (0, exports.u8)(b)) >> 8);
exports.high8 = high8;
/** `p >> 7` truncation with a byte ceiling, per the CODE:3fa0 gain stage:
 *  `p = g * v; 0036 = min(255, p >> 7)`. Returns the stored byte and the low
 *  fraction that CODE:3f91 consumes. */
const gainQ7 = (gain, value) => {
    const p = (0, exports.u8)(gain) * (0, exports.u8)(value);
    return { stored: Math.min(0xff, p >> 7), fraction: p & 0x7f };
};
exports.gainQ7 = gainQ7;
/** 24-bit extended timestamp: `epoch:high:low` (SPECS: "003f:CRCH:CRCL behaves
 *  as an extended capture time"). */
const timestamp24 = (epoch, high, low) => ((epoch & 0xff) << 16) | ((high & 0xff) << 8) | (low & 0xff);
exports.timestamp24 = timestamp24;
/** Nibble accessors — fault status bytes are nibble-packed (SPECS: adaptation
 *  status nibbles in XRAM 002f, fault status low nibble = monitor subtype). */
const lowNibble = (v) => v & 0x0f;
exports.lowNibble = lowNibble;
const highNibble = (v) => (v >> 4) & 0x0f;
exports.highNibble = highNibble;
const packNibbles = (high, low) => (0, exports.u8)(((high & 0x0f) << 4) | (low & 0x0f));
exports.packNibbles = packNibbles;
const bitSet = (v, bit) => (0, exports.u8)(v | (1 << bit));
exports.bitSet = bitSet;
const bitClear = (v, bit) => (0, exports.u8)(v & ~(1 << bit));
exports.bitClear = bitClear;
const bitGet = (v, bit) => ((v >> bit) & 1) === 1;
exports.bitGet = bitGet;
const bitWrite = (v, bit, on) => on ? (0, exports.bitSet)(v, bit) : (0, exports.bitClear)(v, bit);
exports.bitWrite = bitWrite;
/** Neutral adaptation/fallback value. XRAM cells are neutralised to 0x80 in
 *  three separate proven places (CODE:678e disable, CODE:6de3 restore). */
exports.NEUTRAL = 0x80;
