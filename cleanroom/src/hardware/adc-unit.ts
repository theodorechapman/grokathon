/**
 * SAB80C515 ADC: ADCON0, ADDAT, DAPR.
 *
 * CODE:9ec2 is proven to be a blocking read:
 *   `ADCON0 = (ADCON0 & 0xf8) | (channel & 7); DAPR = 0; wait; result = ADDAT`
 *
 * The ADC interrupt wrapper at 2080 is a direct RETI, so acquisition is polled.
 * This model therefore completes a conversion synchronously and never pends the
 * ADC interrupt — the wrapper exists, it just does nothing.
 */

import { u8 } from '../byte-math.ts';
import { SFR } from '../memory-map.ts';
import { SfrFile } from './sfr-file.ts';

/** Eight multiplexed inputs; the channel field is three bits wide. */
const CHANNELS = 8;

export class AdcUnit {
  /** Physical input level per channel, 8-bit. Driven by the test bench or a
   *  plant model, never by firmware code. */
  private readonly inputs = new Uint8Array(CHANNELS);
  private conversions = 0;

  private readonly sfr: SfrFile;

  constructor(sfr: SfrFile) {
    this.sfr = sfr;
  }

  /** Bench-side: set what the pin is presenting. */
  setInput(channel: number, raw: number): void {
    this.inputs[channel & 0x07] = u8(raw);
  }

  getInput(channel: number): number {
    return this.inputs[channel & 0x07];
  }

  /** CODE:9ec2. Selects the channel, starts the conversion via DAPR, waits,
   *  and returns ADDAT. */
  convert(channel: number): number {
    this.sfr.update(SFR.ADCON0, (current) => (current & 0xf8) | (channel & 0x07));
    this.sfr.write(SFR.DAPR, 0);
    const result = this.inputs[channel & 0x07];
    this.sfr.write(SFR.ADDAT, result);
    this.conversions += 1;
    return result;
  }

  /** Last conversion result, for the paths that read ADDAT directly
   *  (CODE:2ce8 in the AFM path, CODE:261c after starting channel 0). */
  latest(): number {
    return this.sfr.read(SFR.ADDAT);
  }

  /** Start a conversion without consuming it, as CODE:261c does for channel 0. */
  start(channel: number): void {
    this.convert(channel);
  }

  conversionCount(): number {
    return this.conversions;
  }

  reset(): void {
    this.conversions = 0;
    this.sfr.write(SFR.ADCON0, 0);
    this.sfr.write(SFR.ADDAT, 0);
    this.sfr.write(SFR.DAPR, 0);
  }
}
