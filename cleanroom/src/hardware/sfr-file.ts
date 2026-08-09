/**
 * Special function registers, 0x80-0xff.
 *
 * Peripherals in this model own their behaviour but store their state here, so
 * the register image is real: a test can read `SFR.ADCON0` after a conversion
 * and see the channel field the firmware wrote.
 */

import { bitGet, bitWrite, u8 } from '../byte-math.ts';

export class SfrFile {
  private readonly cells = new Uint8Array(0x80);

  read(address: number): number {
    return this.cells[(address & 0xff) - 0x80];
  }

  write(address: number, value: number): void {
    this.cells[(address & 0xff) - 0x80] = u8(value);
  }

  update(address: number, transform: (current: number) => number): number {
    const next = u8(transform(this.read(address)));
    this.write(address, next);
    return next;
  }

  getBit(address: number, bit: number): boolean {
    return bitGet(this.read(address), bit);
  }

  setBit(address: number, bit: number, on: boolean): void {
    this.write(address, bitWrite(this.read(address), bit, on));
  }

  /** High-byte-first register pair, the layout of CRCH:CRCL and TH2:TL2. */
  readPair(highAddress: number, lowAddress: number): number {
    return (this.read(highAddress) << 8) | this.read(lowAddress);
  }

  writePair(highAddress: number, lowAddress: number, value: number): void {
    this.write(highAddress, (value >> 8) & 0xff);
    this.write(lowAddress, value & 0xff);
  }

  clear(): void {
    this.cells.fill(0);
  }

  snapshot(): Uint8Array {
    return this.cells.slice();
  }
}
