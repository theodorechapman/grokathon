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

import { PAYLOAD_CATALOG, type PayloadEntry } from './payload-catalog.ts';
import { REV_LIMIT, buildRevLimitRecord } from './rev-limit-record.ts';
import { SELECTOR_TABLES, SELECTOR_TERMINATOR } from './selector-tables.ts';
import { decodeDescriptor, encodeDescriptor, type Descriptor } from './descriptor.ts';
import { spanAxis, synthesizePayload } from './payload-shapes.ts';

export const CALIBRATION_BASE = 0x4000;
export const CALIBRATION_END = 0x6000;
/** SPECS: "the 150-entry master directory". */
export const MASTER_DIRECTORY_BASE = 0x45c0;
export const MASTER_DIRECTORY_ENTRIES = 150;
/** Directory entries are a 2-byte descriptor address; the top bit carries the
 *  one/two-axis flag, which the descriptor itself does not encode. */
const TWO_AXIS_FLAG = 0x8000;
const EMPTY_SLOT = 0xffff;

export class CalibrationImage {
  private readonly bytes = new Uint8Array(CALIBRATION_END - CALIBRATION_BASE).fill(0xff);
  private readonly descriptorBases = new Map<number, number>();

  read(address: number): number {
    return this.bytes[address - CALIBRATION_BASE];
  }

  write(address: number, value: number): void {
    this.bytes[address - CALIBRATION_BASE] = value & 0xff;
  }

  copyIn(address: number, data: ArrayLike<number>): void {
    this.bytes.set(Uint8Array.from(data as ArrayLike<number>), address - CALIBRATION_BASE);
  }

  readWord(address: number): number {
    return (this.read(address) << 8) | this.read(address + 1);
  }

  /** Master directory entry for a slot, resolved through a pointer window. */
  directoryEntry(windowBase: number, slot: number): { base: number; twoAxis: boolean } | null {
    const raw = this.readWord(windowBase + slot * 2);
    if (raw === EMPTY_SLOT) return null;
    return { base: raw & ~TWO_AXIS_FLAG, twoAxis: (raw & TWO_AXIS_FLAG) !== 0 };
  }

  /** Selector table lookup: logical index to master slot, or 0xff. */
  selector(tableBase: number, logicalIndex: number): number {
    return this.read(tableBase + logicalIndex);
  }

  descriptorAt(base: number, twoAxis: boolean): Descriptor {
    return decodeDescriptor(this.bytes, base - CALIBRATION_BASE, twoAxis);
  }

  descriptorBaseFor(payloadAddress: number): number {
    const base = this.descriptorBases.get(payloadAddress);
    if (base === undefined) throw new Error(`no descriptor for payload ${payloadAddress.toString(16)}`);
    return base;
  }

  registerDescriptor(payloadAddress: number, base: number): void {
    this.descriptorBases.set(payloadAddress, base);
  }

  snapshot(): Uint8Array {
    return this.bytes.slice();
  }
}

interface PlacedDescriptor {
  entry: PayloadEntry;
  base: number;
  end: number;
  encoded: Uint8Array;
}

const place = (entry: PayloadEntry): PlacedDescriptor => {
  const spec = {
    axes: entry.axes.map((axis) => ({
      inputAddress: axis.inputAddress,
      points: spanAxis(axis.count),
    })),
    values: synthesizePayload(entry.shape, entry.axes[0].count, entry.axes[1]?.count ?? 1),
  };
  const encoded = encodeDescriptor(spec);
  const headerBytes = encoded.length - spec.values.length;
  const base = entry.payloadAddress - headerBytes;
  if (base < CALIBRATION_BASE) {
    throw new Error(`descriptor for ${entry.payloadAddress.toString(16)} starts below the region`);
  }
  return { entry, base, end: base + encoded.length, encoded };
};

const write = (image: CalibrationImage, placed: PlacedDescriptor): void => {
  image.copyIn(placed.base, placed.encoded);
  image.registerDescriptor(placed.entry.payloadAddress, placed.base);

  const flag = placed.entry.axes.length > 1 ? TWO_AXIS_FLAG : 0;
  const address = MASTER_DIRECTORY_BASE + placed.entry.slot * 2;
  image.write(address, ((placed.base | flag) >> 8) & 0xff);
  image.write(address + 1, (placed.base | flag) & 0xff);
};

export const buildCalibrationImage = (): CalibrationImage => {
  const image = new CalibrationImage();

  for (let slot = 0; slot < MASTER_DIRECTORY_ENTRIES; slot += 1) {
    image.write(MASTER_DIRECTORY_BASE + slot * 2, 0xff);
    image.write(MASTER_DIRECTORY_BASE + slot * 2 + 1, 0xff);
  }

  for (const table of SELECTOR_TABLES) {
    table.slots.forEach((slot, index) => image.write(table.base + index, slot));
    image.write(table.base + table.slots.length, SELECTOR_TERMINATOR);
  }

  const record = buildRevLimitRecord();
  image.copyIn(REV_LIMIT.primaryRecordBase, record);
  image.copyIn(REV_LIMIT.secondaryRecordBase, record);

  const placed = [...PAYLOAD_CATALOG]
    .sort((a, b) => a.payloadAddress - b.payloadAddress)
    .map(place);

  // A descriptor's header sits below its payload address, so consecutive tables
  // collide unless each one's end clears the next one's base.
  for (let i = 0; i + 1 < placed.length; i += 1) {
    const current = placed[i];
    const next = placed[i + 1];
    if (current.end > next.base) {
      throw new Error(
        `table ${current.entry.payloadAddress.toString(16)} ends at ${current.end.toString(16)}, ` +
          `overlapping ${next.entry.payloadAddress.toString(16)} whose descriptor starts at ${next.base.toString(16)}`,
      );
    }
  }

  for (const item of placed) write(image, item);

  return image;
};
