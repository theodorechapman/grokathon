/**
 * Paged external RAM.
 *
 * SPECS repeatedly flags that `MOVX @Ri` combines an 8-bit offset with the page
 * register, and that page reconstruction is required before some offsets can be
 * named. This model therefore keeps page and offset separate at the API: a
 * caller either supplies a full 16-bit address it knows, or a page plus offset.
 * Nothing silently assumes page 0.
 */

import { u8 } from '../byte-math.ts';

/** 2 KiB covers every address the specification names (up to 0x03fe). */
const SIZE = 0x0800;

export class ExternalMemory {
  private readonly cells = new Uint8Array(SIZE);
  /** The `P2` page latch used by `MOVX @Ri`. */
  private page = 0;

  selectPage(page: number): void {
    this.page = u8(page);
  }

  currentPage(): number {
    return this.page;
  }

  read(address: number): number {
    return this.cells[address % SIZE];
  }

  write(address: number, value: number): void {
    this.cells[address % SIZE] = u8(value);
  }

  /** `MOVX A,@Ri` — offset within the currently selected page. */
  readPaged(offset: number): number {
    return this.read((this.page << 8) | u8(offset));
  }

  /** `MOVX @Ri,A` — offset within the currently selected page. */
  writePaged(offset: number, value: number): void {
    this.write((this.page << 8) | u8(offset), value);
  }

  readWord(address: number): number {
    return (this.read(address) << 8) | this.read(address + 1);
  }

  writeWord(address: number, value: number): void {
    this.write(address, (value >> 8) & 0xff);
    this.write(address + 1, value & 0xff);
  }

  fill(from: number, to: number, value: number): void {
    for (let a = from; a <= to; a += 1) this.write(a, value);
  }

  copyIn(address: number, bytes: ArrayLike<number>): void {
    for (let i = 0; i < bytes.length; i += 1) this.write(address + i, bytes[i]);
  }

  slice(from: number, length: number): Uint8Array {
    const out = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) out[i] = this.read(from + i);
    return out;
  }

  clear(): void {
    this.cells.fill(0);
  }

  snapshot(): Uint8Array {
    return this.cells.slice();
  }
}
