/**
 * KW71 protocol state machine.
 *
 * Proven state, all of it in internal memory:
 *   0034 protocol phase, 0035 current transmit/receive byte, 0032 timeout/retry
 *   counter, 0030 data pointer, 0031 remaining length, 0033 command/mode.
 *
 * Proven dispatch: "CODE:8a1b dispatches phases to 8aa0, 8aed, 8afd, 8b36, and
 * 8b70." Proven handshake: "CODE:774f recognizes received 0x06 in one startup
 * state, updates paged XRAM protocol state, and calls 8475. State 0 transmits
 * synchronization 0x55; state 1 performs keyword/complement exchange."
 *
 * Proven failure behaviour: "Invalid length, complement mismatch, timeout, and
 * protocol-state mismatch reset or roll back the state machine."
 */

import { IDATA, XRAM } from '../memory-map.ts';
import { u8 } from '../byte-math.ts';
import type { EcuContext } from '../context.ts';
import type { Kw71Uart } from './kw71-uart.ts';
import {
  BLOCK_TERMINATOR,
  HANDSHAKE_BYTE,
  SYNC_BYTE,
  complement,
  isAcceptableLength,
  isValidEcho,
  serializeBlock,
} from './kw71-framing.ts';
import { handleService, type ServiceDependencies } from './kw71-services.ts';

/** The phase byte at INTMEM:0034, with the routine each phase dispatches to. */
export const PHASE = {
  /** State 0 transmits synchronisation 0x55. */
  sync: 0,
  /** State 1 performs the keyword/complement exchange. */
  keyword: 1,
  /** Idle between blocks; CODE:8aa0 validates the echo. */
  ready: 2,
  /** CODE:8afd accepts the length byte. */
  length: 3,
  /** CODE:8b36 stores, decrements, complements, transmits. */
  body: 4,
  /** CODE:8b70 completes the block. */
  complete: 5,
} as const;

/** Timeout reloads, in foreground passes. Units are not recovered. */
const TIMEOUT_RELOAD = 50;

export class Kw71Session {
  private received: number[] = [];
  private lastSent = 0;
  private awaitingEcho = false;

  private readonly context: EcuContext;
  private readonly uart: Kw71Uart;
  private readonly services: ServiceDependencies;

  constructor(context: EcuContext, uart: Kw71Uart, services: ServiceDependencies) {
    this.context = context;
    this.uart = uart;
    this.services = services;
  }

  initialise(): void {
    const { idata } = this.context.machine;
    idata.write(IDATA.diagPhase, PHASE.sync);
    idata.write(IDATA.diagTimeout, TIMEOUT_RELOAD);
    idata.write(IDATA.diagRemainingLength, 0);
    idata.write(IDATA.diagDataPointer, 0);
    idata.write(IDATA.diagCommand, 0);
    this.received = [];
    this.awaitingEcho = false;
  }

  phase(): number {
    return this.context.machine.idata.read(IDATA.diagPhase);
  }

  private setPhase(phase: number): void {
    this.context.machine.idata.write(IDATA.diagPhase, phase);
  }

  /** Called from the foreground cycle. Drives 0x55, timeouts, and byte intake. */
  service(): void {
    if (this.phase() === PHASE.sync) {
      this.transmit(SYNC_BYTE);
      this.setPhase(PHASE.keyword);
      return;
    }
    if (this.uart.hasPendingByte()) {
      this.dispatch(this.uart.takePendingByte());
      return;
    }
    this.countdown();
  }

  /** Timeouts decrement INTMEM:0032; expiry calls CODE:8943. */
  private countdown(): void {
    const { idata } = this.context.machine;
    const { expired } = idata.decrementToZero(IDATA.diagTimeout);
    if (!expired) return;
    this.uart.onTimeout();
    this.reset();
  }

  /** CODE:8a1b — dispatch the byte to the routine for the current phase. */
  private dispatch(byte: number): void {
    const { idata } = this.context.machine;
    idata.write(IDATA.diagTimeout, TIMEOUT_RELOAD);

    if (this.awaitingEcho) {
      // CODE:8aa0 — the byte must be the complement of what was just sent.
      if (!isValidEcho(byte, this.lastSent)) {
        this.reset();
        return;
      }
      this.awaitingEcho = false;
      return;
    }

    switch (this.phase()) {
      case PHASE.keyword:
        this.keywordExchange(byte);
        return;
      case PHASE.ready:
        this.acceptLength(byte);
        return;
      case PHASE.length:
        this.acceptLength(byte);
        return;
      case PHASE.body:
        this.acceptBodyByte(byte);
        return;
      default:
        this.reset();
    }
  }

  /** CODE:774f — 0x06 in the startup state advances the session, updating the
   *  paged XRAM protocol state and calling 8475. */
  private keywordExchange(byte: number): void {
    const { xram } = this.context.machine;
    if (byte === HANDSHAKE_BYTE) {
      xram.write(XRAM.diagFrameSequence, 0);
      this.establish();
      return;
    }
    // Otherwise this is a keyword byte: answer with its complement.
    this.transmit(complement(byte));
  }

  /** CODE:8475 — session established. */
  private establish(): void {
    this.setPhase(PHASE.ready);
    this.received = [];
  }

  /** CODE:8afd — a length byte no greater than 0x10. */
  private acceptLength(byte: number): void {
    if (!isAcceptableLength(byte)) {
      this.reset();
      return;
    }
    const { idata } = this.context.machine;
    idata.write(IDATA.diagRemainingLength, byte);
    idata.write(IDATA.diagDataPointer, 0);
    this.received = [];
    this.setPhase(PHASE.body);
    this.transmit(complement(byte));
  }

  /** CODE:8b36 — store, decrement remaining, complement, transmit. */
  private acceptBodyByte(byte: number): void {
    const { idata } = this.context.machine;
    this.received.push(byte);
    idata.write(IDATA.diagDataPointer, this.received.length);
    const { expired } = idata.decrementToZero(IDATA.diagRemainingLength);

    if (byte === BLOCK_TERMINATOR || expired) {
      this.completeBlock();
      return;
    }
    this.transmit(complement(byte));
  }

  /** CODE:8b70 — the block is complete; answer it. */
  private completeBlock(): void {
    const bytes = this.received;
    this.received = [];
    this.setPhase(PHASE.ready);

    const sequence = bytes[0] ?? 0;
    const service = bytes[1] ?? 0;
    const payload = bytes.slice(2).filter((b) => b !== BLOCK_TERMINATOR);
    this.context.machine.idata.write(IDATA.diagCommand, service);

    const response = handleService(this.services, service, payload);
    this.sendBlock(u8(sequence + 1), response.service, response.payload);
  }

  /** Assemble an outgoing frame in XRAM 00b1-00b4 and put it on the wire. */
  sendBlock(sequence: number, service: number, payload: readonly number[]): void {
    const { xram } = this.context.machine;
    const block = {
      length: payload.length + 3,
      sequence,
      service,
      payload: [...payload],
    };
    xram.write(XRAM.diagFrameLength, block.length);
    xram.write(XRAM.diagFrameSequence, block.sequence);
    xram.write(XRAM.diagFrameService, block.service);
    for (let i = 0; i < block.payload.length; i += 1) {
      xram.write(XRAM.diagFramePayload + i, block.payload[i]);
    }
    for (const byte of serializeBlock(block)) this.transmit(byte);
  }

  private transmit(byte: number): void {
    this.lastSent = u8(byte);
    this.context.machine.idata.write(IDATA.diagByte, this.lastSent);
    this.uart.send(this.lastSent);
  }

  /** Protocol-state mismatch, bad length, or bad echo: roll back. */
  private reset(): void {
    this.received = [];
    this.awaitingEcho = false;
    const { idata } = this.context.machine;
    idata.write(IDATA.diagRemainingLength, 0);
    idata.write(IDATA.diagDataPointer, 0);
    idata.write(IDATA.diagTimeout, TIMEOUT_RELOAD);
    this.setPhase(PHASE.sync);
  }
}
