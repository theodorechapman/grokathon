/**
 * Serial hardware layer for the diagnostic link.
 *
 * Proven: "The serial vector 0023 jumps through 2060 to 8960. 8960 disables the
 * serial interrupt, selects SCON = 0x90 or 0xfa from a mode bit, and returns.
 * 8919 configures SCON, writes one byte to SBUF, and re-enables the serial
 * interrupt." And: "Timeouts decrement 0032; expiration calls 8943, which
 * resets serial configuration and can re-enter full initialization at 5c00
 * under a specific runtime condition."
 *
 * Because 8960 only latches and returns, the received byte is parked in
 * INTMEM:0035 and consumed by the foreground session — which is exactly the
 * cooperative shape the scheduler chapter describes.
 */

import { IDATA } from '../memory-map.ts';
import { SCON_MODE_A, SCON_MODE_B } from '../hardware/serial-port.ts';
import type { EcuContext } from '../context.ts';

export class Kw71Uart {
  /** The mode bit 8960 selects SCON from. Its meaning is not recovered. */
  private modeBit = false;
  private pending = false;
  /** The runtime condition under which 8943 re-enters initialisation. */
  reinitialiseOnTimeout = false;

  private readonly context: EcuContext;

  constructor(context: EcuContext) {
    this.context = context;
  }

  setModeBit(on: boolean): void {
    this.modeBit = on;
  }

  /** CODE:8960 — serial vector worker. */
  onSerialInterrupt(): void {
    const { machine } = this.context;
    machine.serial.enableInterrupt(false);
    // The byte comes out of SBUF before SCON is rewritten: selecting the mode
    // word overwrites RI and TI along with everything else.
    if (machine.serial.hasReceived()) {
      machine.idata.write(IDATA.diagByte, machine.serial.takeReceived());
      this.pending = true;
    }
    if (machine.serial.transmitComplete()) machine.serial.clearTransmitFlag();
    machine.serial.configure(this.modeBit ? SCON_MODE_B : SCON_MODE_A);
  }

  /** A byte is waiting in INTMEM:0035. */
  hasPendingByte(): boolean {
    return this.pending;
  }

  takePendingByte(): number {
    this.pending = false;
    return this.context.machine.idata.read(IDATA.diagByte);
  }

  /** CODE:8919 — configure, transmit, re-enable. */
  send(byte: number): void {
    const { machine } = this.context;
    machine.serial.configure(this.modeBit ? SCON_MODE_B : SCON_MODE_A);
    machine.serial.transmit(byte);
    machine.serial.enableInterrupt(true);
  }

  /** CODE:8943 — timeout recovery. */
  onTimeout(): void {
    const { machine } = this.context;
    machine.serial.configure(SCON_MODE_A);
    machine.serial.enableInterrupt(true);
    this.pending = false;
    if (this.reinitialiseOnTimeout) this.context.restart('serial-timeout-8943');
  }

  /** Bytes the ECU has put on the wire. */
  transmitted(): readonly number[] {
    return this.context.machine.serial.txLog;
  }
}
