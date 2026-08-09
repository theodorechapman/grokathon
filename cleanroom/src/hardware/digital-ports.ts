/**
 * Digital port bits.
 *
 * SPECS is explicit that the firmware-to-PCB mapping was never recovered: DME
 * pin numbers are known from BMW wiring, but which MCU port bit reaches which
 * pin is not. Two port bits *are* named by the diagnostics chapter, because the
 * actuator-test decoder drives them directly: P1.2 alongside CC2 and P1.3
 * alongside CC3.
 *
 * Every other bit is a model-local name with no pin claim attached.
 */

import { bitGet, bitWrite } from '../byte-math.ts';
import { SFR } from '../memory-map.ts';
import { SfrFile } from './sfr-file.ts';

/** The only two port bits the specification ties to a function. */
export const NAMED_PORT_BITS = {
  /** Driven with compare channel 2 by the periodic actuator service (8000). */
  p1_2: 2,
  /** Driven with compare channel 3 by the periodic actuator service (8000). */
  p1_3: 3,
} as const;

export interface PortTransition {
  port: 'P1';
  bit: number;
  value: boolean;
}

export class DigitalPorts {
  readonly transitions: PortTransition[] = [];

  private readonly sfr: SfrFile;

  constructor(sfr: SfrFile) {
    this.sfr = sfr;
  }

  setP1(bit: number, value: boolean): void {
    const before = bitGet(this.sfr.read(SFR.P1), bit);
    this.sfr.write(SFR.P1, bitWrite(this.sfr.read(SFR.P1), bit, value));
    if (before !== value) this.transitions.push({ port: 'P1', bit, value });
  }

  getP1(bit: number): boolean {
    return bitGet(this.sfr.read(SFR.P1), bit);
  }

  pulseP1(bit: number): void {
    this.setP1(bit, true);
    this.setP1(bit, false);
  }

  reset(): void {
    this.transitions.length = 0;
    this.sfr.write(SFR.P1, 0);
  }
}
