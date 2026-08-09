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

import { u8 } from '../byte-math.ts';

export interface DescriptorAxis {
  /** Direct-data address of the live value this axis is indexed by. */
  inputAddress: number;
  /** Absolute breakpoints, reconstructed from the cumulative deltas. */
  points: number[];
}

export interface Descriptor {
  address: number;
  axes: DescriptorAxis[];
  /** Row-major: `payload[row * columns + column]`, row = axis 0. */
  payload: Uint8Array;
  columns: number;
  rows: number;
}

const decodeAxis = (
  image: Uint8Array,
  cursor: number,
): { axis: DescriptorAxis; next: number } => {
  const inputAddress = image[cursor];
  const count = image[cursor + 1];
  if (count === 0) throw new Error(`descriptor axis at ${cursor.toString(16)} has no points`);
  const points: number[] = [];
  let value = 0;
  for (let i = 0; i < count; i += 1) {
    value = u8(value + image[cursor + 2 + i]);
    points.push(value);
  }
  return { axis: { inputAddress, points }, next: cursor + 2 + count };
};

export const decodeDescriptor = (
  image: Uint8Array,
  address: number,
  twoAxis: boolean,
): Descriptor => {
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

export interface DescriptorSpec {
  axes: Array<{ inputAddress: number; points: number[] }>;
  /** Row-major values, `rows * columns` long. */
  values: number[];
}

/** Inverse of `decodeDescriptor`, used to lay a calibration image down. */
export const encodeDescriptor = (spec: DescriptorSpec): Uint8Array => {
  const out: number[] = [];
  for (const axis of spec.axes) {
    out.push(u8(axis.inputAddress), u8(axis.points.length));
    let previous = 0;
    for (const point of axis.points) {
      out.push(u8(point - previous));
      previous = point;
    }
  }
  const expected = spec.axes.reduce((n, a) => n * a.points.length, 1);
  if (spec.values.length !== expected) {
    throw new Error(`descriptor payload is ${spec.values.length} bytes, expected ${expected}`);
  }
  for (const value of spec.values) out.push(u8(value));
  return Uint8Array.from(out);
};
