/**
 * ADC acquisition.
 *
 * Proven, from SPECS:
 *  - CODE:9ec2 is a blocking channel read;
 *  - CODE:9e88 scans channels 1-5 into INTMEM:0036-003a;
 *  - CODE:261c starts channel 0;
 *  - CODE:2ce8 reads ADDAT directly in the AFM path;
 *  - the ADC interrupt wrapper at 2080 is a direct RETI, so acquisition is
 *    polled or synchronously scheduled — never interrupt-driven.
 *
 * Which connector signal each channel carries is not established by the binary.
 * The scan writes channels 1-5 to their proven destinations and says nothing
 * about what is on the other end.
 */

import { IDATA } from '../memory-map.ts';
import { gainQ7 } from '../byte-math.ts';
import type { EcuContext } from '../context.ts';

/** The five channels CODE:9e88 sweeps, and where each result lands. */
export const SCAN_DESTINATIONS: ReadonlyArray<{ channel: number; address: number }> = [
  { channel: 1, address: IDATA.adcChannel1 },
  { channel: 2, address: IDATA.adcChannel2 },
  { channel: 3, address: IDATA.adcChannel3 },
  { channel: 4, address: IDATA.adcChannel4 },
  { channel: 5, address: IDATA.adcChannel5 },
];

/** Channel started by CODE:261c; the AFM path consumes ADDAT separately. */
export const AFM_CHANNEL = 0;

export class AdcAcquisition {
  /** Low fraction left by the CODE:3fa0 gain stage, consumed by CODE:3f91. */
  private supplyFraction = 0;

  private readonly context: EcuContext;

  constructor(context: EcuContext) {
    this.context = context;
  }

  /** CODE:9ec2 — blocking read of one channel. */
  readChannel(channel: number): number {
    return this.context.machine.adc.convert(channel);
  }

  /** CODE:9e88 — sweep channels 1..5 into INTMEM:0036-003a. */
  scan(): void {
    const { idata } = this.context.machine;
    for (const { channel, address } of SCAN_DESTINATIONS) {
      idata.write(address, this.readChannel(channel));
    }
  }

  /** CODE:261c — start the AFM channel without consuming the result. */
  startAfmConversion(): void {
    this.context.machine.adc.start(AFM_CHANNEL);
  }

  /** CODE:2ce8 — read ADDAT directly in the AFM path. */
  readAfmSample(): number {
    return this.context.machine.adc.latest();
  }

  /**
   * CODE:3fa0 — calibrated gain applied to the supply channel:
   * `p = g * v; 0036 = min(255, p >> 7)`, with the low fraction handed on.
   */
  applySupplyGain(gain: number): number {
    const { idata } = this.context.machine;
    const { stored, fraction } = gainQ7(gain, idata.read(IDATA.scaledSupplyVoltage));
    idata.write(IDATA.scaledSupplyVoltage, stored);
    this.supplyFraction = fraction;
    return stored;
  }

  /** The fraction CODE:3f91 consumes. */
  gainFraction(): number {
    return this.supplyFraction;
  }
}
