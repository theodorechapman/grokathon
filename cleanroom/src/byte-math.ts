/**
 * 8051 arithmetic primitives.
 *
 * Every value the firmware computes is an unsigned byte or a byte pair, and
 * every overflow it tolerates is either a documented wrap or an explicit
 * saturation (SPECS: "state comparisons and saturation prevent byte overflow").
 * These helpers are the only place that truncation happens.
 */

export const u8 = (v: number): number => v & 0xff;

export const u16 = (v: number): number => v & 0xffff;

/** Signed reading of a byte, as an 8051 does with a sign-bit test. */
export const s8 = (v: number): number => ((v & 0xff) ^ 0x80) - 0x80;

/** Saturating byte clamp, not a wrap. Used wherever the firmware compares
 *  before storing rather than letting a result roll over. */
export const sat8 = (v: number): number => (v < 0 ? 0 : v > 0xff ? 0xff : Math.trunc(v));

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

/** `high8(a * b)` — the fixed-point product form proven at CODE:3585
 *  (`EXTMEM:006e = high8(calibration_a * calibration_b)`). */
export const high8 = (a: number, b: number): number => u8((u8(a) * u8(b)) >> 8);

/** `p >> 7` truncation with a byte ceiling, per the CODE:3fa0 gain stage:
 *  `p = g * v; 0036 = min(255, p >> 7)`. Returns the stored byte and the low
 *  fraction that CODE:3f91 consumes. */
export const gainQ7 = (gain: number, value: number): { stored: number; fraction: number } => {
  const p = u8(gain) * u8(value);
  return { stored: Math.min(0xff, p >> 7), fraction: p & 0x7f };
};

/** 24-bit extended timestamp: `epoch:high:low` (SPECS: "003f:CRCH:CRCL behaves
 *  as an extended capture time"). */
export const timestamp24 = (epoch: number, high: number, low: number): number =>
  ((epoch & 0xff) << 16) | ((high & 0xff) << 8) | (low & 0xff);

/** Nibble accessors — fault status bytes are nibble-packed (SPECS: adaptation
 *  status nibbles in XRAM 002f, fault status low nibble = monitor subtype). */
export const lowNibble = (v: number): number => v & 0x0f;
export const highNibble = (v: number): number => (v >> 4) & 0x0f;
export const packNibbles = (high: number, low: number): number =>
  u8(((high & 0x0f) << 4) | (low & 0x0f));

export const bitSet = (v: number, bit: number): number => u8(v | (1 << bit));
export const bitClear = (v: number, bit: number): number => u8(v & ~(1 << bit));
export const bitGet = (v: number, bit: number): boolean => ((v >> bit) & 1) === 1;
export const bitWrite = (v: number, bit: number, on: boolean): number =>
  on ? bitSet(v, bit) : bitClear(v, bit);

/** Neutral adaptation/fallback value. XRAM cells are neutralised to 0x80 in
 *  three separate proven places (CODE:678e disable, CODE:6de3 restore). */
export const NEUTRAL = 0x80;
