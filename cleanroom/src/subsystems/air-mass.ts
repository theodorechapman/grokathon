/**
 * Air-mass acquisition and filtering.
 *
 * Proven chain: "CODE:2ce8 acquires AFM samples; ... assembly-authority
 * function 2d73 produces filtered air mass at 0041-0042." SPECS rates the
 * AFM-to-airmass-to-load producer chain as high confidence, while refusing to
 * assign engineering units to the result.
 *
 * The filter itself is not recovered — SPECS says only that 2d73 produces the
 * filtered value. A first-order integer low-pass is the model's choice and is
 * labelled as such; the 16-bit destination pair is the specification's.
 */

import { IDATA } from '../memory-map.ts';
import type { EcuContext } from '../context.ts';
import type { AdcAcquisition } from './adc-acquisition.ts';

/** Filter shift. Larger is slower. Model choice, not recovered. */
const FILTER_SHIFT = 3;

export class AirMassFilter {
  private lastSample = 0;

  private readonly context: EcuContext;
  private readonly adc: AdcAcquisition;

  constructor(context: EcuContext, adc: AdcAcquisition) {
    this.context = context;
    this.adc = adc;
  }

  initialise(): void {
    this.context.machine.idata.writeWord(IDATA.filteredAirMassHigh, 0);
    this.lastSample = 0;
  }

  /** CODE:2ce8 — take an AFM sample. */
  sample(): number {
    this.adc.startAfmConversion();
    this.lastSample = this.adc.readAfmSample();
    return this.lastSample;
  }

  /** CODE:2d73 — update the filtered air mass at INTMEM:0041-0042. */
  update(): number {
    const { idata } = this.context.machine;
    const target = this.lastSample << 8;
    const current = idata.readWord(IDATA.filteredAirMassHigh);
    const next = (current + ((target - current) >> FILTER_SHIFT)) & 0xffff;
    idata.writeWord(IDATA.filteredAirMassHigh, next);
    return next;
  }

  /** Raw sample from the most recent acquisition. */
  rawSample(): number {
    return this.lastSample;
  }

  filtered(): number {
    return this.context.machine.idata.readWord(IDATA.filteredAirMassHigh);
  }

  /** High byte, the form downstream byte-domain arithmetic consumes. */
  filteredByte(): number {
    return (this.filtered() >> 8) & 0xff;
  }
}
