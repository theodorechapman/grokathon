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

import type { Descriptor } from './descriptor.ts';
import { sat8, u8 } from '../byte-math.ts';

export interface AxisPosition {
  /** Lower breakpoint index. */
  index: number;
  /** Distance to the next breakpoint, as a 0..255 numerator. */
  fraction: number;
  /** True when the live value sat outside the calibrated domain and was
   *  clamped to an end point. */
  clamped: boolean;
}

/** CODE:046a — locate the interval containing `value`. */
export const locateAxis = (points: readonly number[], value: number): AxisPosition => {
  const last = points.length - 1;
  if (points.length === 1) return { index: 0, fraction: 0, clamped: true };
  if (value <= points[0]) return { index: 0, fraction: 0, clamped: value < points[0] };
  if (value >= points[last]) return { index: last - 1, fraction: 0xff, clamped: value > points[last] };

  let index = 0;
  while (index < last - 1 && value >= points[index + 1]) index += 1;
  const span = points[index + 1] - points[index];
  const fraction = span === 0 ? 0 : Math.trunc(((value - points[index]) * 0x100) / span);
  return { index, fraction: Math.min(0xff, fraction), clamped: false };
};

/** CODE:0493 — blend two adjacent bytes. */
export const blend = (low: number, high: number, fraction: number): number =>
  sat8(u8(low) + ((((u8(high) - u8(low)) | 0) * (fraction & 0xff)) >> 8));

const cell = (descriptor: Descriptor, row: number, column: number): number => {
  const r = Math.min(row, descriptor.rows - 1);
  const c = Math.min(column, descriptor.columns - 1);
  return descriptor.payload[r * descriptor.columns + c];
};

export interface Interpolation {
  value: number;
  first: AxisPosition;
  second: AxisPosition | null;
}

/**
 * Evaluate a descriptor against live axis values. One axis uses 0493 alone;
 * two axes apply 0493 on each row and 04a2 across the result.
 */
export const interpolateDescriptor = (
  descriptor: Descriptor,
  axisValues: readonly number[],
): Interpolation => {
  const first = locateAxis(descriptor.axes[0].points, axisValues[0] ?? 0);

  if (descriptor.axes.length === 1) {
    const value = blend(
      cell(descriptor, first.index, 0),
      cell(descriptor, first.index + 1, 0),
      first.fraction,
    );
    return { value, first, second: null };
  }

  const second = locateAxis(descriptor.axes[1].points, axisValues[1] ?? 0);
  const lowRow = blend(
    cell(descriptor, first.index, second.index),
    cell(descriptor, first.index, second.index + 1),
    second.fraction,
  );
  const highRow = blend(
    cell(descriptor, first.index + 1, second.index),
    cell(descriptor, first.index + 1, second.index + 1),
    second.fraction,
  );
  return { value: blend(lowRow, highRow, first.fraction), first, second };
};
