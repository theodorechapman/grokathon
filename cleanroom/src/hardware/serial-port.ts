/**
 * UART used by the KW71 diagnostic link.
 *
 * Proven behaviour: the serial vector 0023 reaches CODE:8960, which disables
 * the serial interrupt, selects `SCON = 0x90` or `0xfa` from a mode bit, and
 * returns. CODE:8919 configures SCON, writes one byte to SBUF, and re-enables
 * the serial interrupt. Transmission completion and byte reception both raise
 * the serial interrupt, so this model pends `serial` on either.
 */

import type { Ticks } from '../types.ts';
import { u8 } from '../byte-math.ts';
import { SFR } from '../memory-map.ts';
import { SfrFile } from './sfr-file.ts';

/** SCON values the firmware selects between (CODE:8960). */
export const SCON_MODE_A = 0x90;
export const SCON_MODE_B = 0xfa;

/** SCON.RI and SCON.TI. */
const RI = 0;
const TI = 1;

export class SerialPort {
  private readonly rxQueue: number[] = [];
  /** Bytes the ECU has put on the wire, in order. */
  readonly txLog: number[] = [];
  private txRemaining: Ticks = 0;
  private interruptEnabled = false;

  private readonly sfr: SfrFile;
  private readonly onInterrupt: () => void;
  /** Ticks per character, derived from the assumed baud rate. */
  private readonly ticksPerByte: Ticks;

  constructor(sfr: SfrFile, onInterrupt: () => void, ticksPerByte: Ticks) {
    this.sfr = sfr;
    this.onInterrupt = onInterrupt;
    this.ticksPerByte = ticksPerByte;
  }

  configure(scon: number): void {
    this.sfr.write(SFR.SCON, u8(scon));
  }

  enableInterrupt(on: boolean): void {
    this.interruptEnabled = on;
  }

  /** CODE:8919 — load SBUF and start shifting. */
  transmit(byte: number): void {
    this.sfr.write(SFR.SBUF, u8(byte));
    this.txLog.push(u8(byte));
    this.txRemaining = this.ticksPerByte;
  }

  /** Bench-side: a byte arriving from the tester. */
  deliver(byte: number): void {
    this.rxQueue.push(u8(byte));
    this.pumpReceive();
  }

  /** True when a received byte is waiting in SBUF. */
  hasReceived(): boolean {
    return this.sfr.getBit(SFR.SCON, RI);
  }

  /** Consume the received byte and clear RI, as a handler does. */
  takeReceived(): number {
    const byte = this.sfr.read(SFR.SBUF);
    this.sfr.setBit(SFR.SCON, RI, false);
    this.pumpReceive();
    return byte;
  }

  transmitComplete(): boolean {
    return this.sfr.getBit(SFR.SCON, TI);
  }

  clearTransmitFlag(): void {
    this.sfr.setBit(SFR.SCON, TI, false);
  }

  advance(ticks: Ticks): void {
    if (this.txRemaining <= 0) return;
    this.txRemaining -= ticks;
    if (this.txRemaining > 0) return;
    this.txRemaining = 0;
    this.sfr.setBit(SFR.SCON, TI, true);
    if (this.interruptEnabled) this.onInterrupt();
  }

  private pumpReceive(): void {
    if (this.sfr.getBit(SFR.SCON, RI)) return;
    const next = this.rxQueue.shift();
    if (next === undefined) return;
    this.sfr.write(SFR.SBUF, next);
    this.sfr.setBit(SFR.SCON, RI, true);
    if (this.interruptEnabled) this.onInterrupt();
  }

  reset(): void {
    this.rxQueue.length = 0;
    this.txLog.length = 0;
    this.txRemaining = 0;
    this.interruptEnabled = false;
    this.sfr.write(SFR.SCON, 0);
    this.sfr.write(SFR.SBUF, 0);
  }
}
