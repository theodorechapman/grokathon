/**
 * The common lookup service, CODE:0400.
 *
 * Proven call sequence:
 *   1. operating state selects a lookup configuration (7930-7c0c), which writes
 *      the pointer-window base to INTMEM:0073-0074 and the selector-table base
 *      to INTMEM:0075-0076;
 *   2. a logical index in R2 selects a descriptor through 0400;
 *   3. 046a, 0493 and 04a2 interpolate byte-domain calibration values;
 *   4. a missing selector returns 0xff and sets BITS:004b (CODE:0413-0418);
 *   5. the service increments R2 at 040f, so a caller can walk successive
 *      logical entries until termination.
 *
 * The configuration bases really are stored in internal memory, so a test can
 * read INTMEM:0073-0076 and see which variant is active.
 */

import { BITS, IDATA } from '../memory-map.ts';
import type { InternalMemory } from '../hardware/internal-memory.ts';
import type { CalibrationImage } from './calibration-image.ts';
import type { LookupConfiguration } from './selector-tables.ts';
import { SELECTOR_TERMINATOR } from './selector-tables.ts';
import { interpolateDescriptor } from './interpolate.ts';
import type { Descriptor } from './descriptor.ts';

export interface LookupResult {
  logicalIndex: number;
  slot: number;
  available: boolean;
  /** 0xff when unavailable, as the firmware returns. */
  value: number;
  descriptor: Descriptor | null;
  /** Live axis values read through the descriptor's direct-data addresses. */
  axisValues: number[];
}

const UNAVAILABLE = 0xff;

export class LookupService {
  private readonly idata: InternalMemory;
  private readonly image: CalibrationImage;

  constructor(idata: InternalMemory, image: CalibrationImage) {
    this.idata = idata;
    this.image = image;
  }

  /** A setup routine in the 7930-7c0c range. */
  configure(configuration: LookupConfiguration): void {
    this.configureRaw(configuration.pointerWindowBase, configuration.selectorTableBase);
  }

  configureRaw(pointerWindowBase: number, selectorTableBase: number): void {
    this.idata.writeWord(IDATA.pointerWindowLow, pointerWindowBase);
    this.idata.writeWord(IDATA.selectorTableLow, selectorTableBase);
  }

  pointerWindow(): number {
    return this.idata.readWord(IDATA.pointerWindowLow);
  }

  selectorTable(): number {
    return this.idata.readWord(IDATA.selectorTableLow);
  }

  /** CODE:0400 for one logical index. */
  evaluate(logicalIndex: number): LookupResult {
    this.idata.setBit(BITS.calibrationMissing, false);
    const slot = this.image.selector(this.selectorTable(), logicalIndex);
    if (slot === SELECTOR_TERMINATOR) return this.missing(logicalIndex, slot);

    const entry = this.image.directoryEntry(this.pointerWindow(), slot);
    if (entry === null) return this.missing(logicalIndex, slot);

    const descriptor = this.image.descriptorAt(entry.base, entry.twoAxis);
    // CODE:046a-0473: the descriptor's axis byte is a direct-data address, read
    // through @R0 to get the live value.
    const axisValues = descriptor.axes.map((axis) => this.idata.read(axis.inputAddress));
    const { value } = interpolateDescriptor(descriptor, axisValues);

    return { logicalIndex, slot, available: true, value, descriptor, axisValues };
  }

  /** CODE:040f — walk successive logical entries until the selector terminates. */
  walk(start = 0, limit = 64): LookupResult[] {
    const results: LookupResult[] = [];
    for (let index = start; index < start + limit; index += 1) {
      const result = this.evaluate(index);
      if (!result.available) break;
      results.push(result);
    }
    return results;
  }

  /** Evaluate the entry a named master slot holds, bypassing the selector.
   *  Used where the firmware consumes a slot directly rather than by walking. */
  evaluateSlot(slot: number): LookupResult {
    const entry = this.image.directoryEntry(this.pointerWindow(), slot);
    if (entry === null) return this.missing(-1, slot);
    const descriptor = this.image.descriptorAt(entry.base, entry.twoAxis);
    const axisValues = descriptor.axes.map((axis) => this.idata.read(axis.inputAddress));
    const { value } = interpolateDescriptor(descriptor, axisValues);
    return { logicalIndex: -1, slot, available: true, value, descriptor, axisValues };
  }

  private missing(logicalIndex: number, slot: number): LookupResult {
    // CODE:0413-0418 — availability failure, not a sensor failure.
    this.idata.setBit(BITS.calibrationMissing, true);
    return {
      logicalIndex,
      slot,
      available: false,
      value: UNAVAILABLE,
      descriptor: null,
      axisValues: [],
    };
  }
}
