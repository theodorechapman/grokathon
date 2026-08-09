"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.Kw71Session = exports.PHASE = void 0;
const memory_map_ts_1 = require("../memory-map.js");
const byte_math_ts_1 = require("../byte-math.js");
const kw71_framing_ts_1 = require("./kw71-framing.js");
const kw71_services_ts_1 = require("./kw71-services.js");
/** The phase byte at INTMEM:0034, with the routine each phase dispatches to. */
exports.PHASE = {
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
};
/** Timeout reloads, in foreground passes. Units are not recovered. */
const TIMEOUT_RELOAD = 50;
class Kw71Session {
    received = [];
    lastSent = 0;
    awaitingEcho = false;
    context;
    uart;
    services;
    constructor(context, uart, services) {
        this.context = context;
        this.uart = uart;
        this.services = services;
    }
    initialise() {
        const { idata } = this.context.machine;
        idata.write(memory_map_ts_1.IDATA.diagPhase, exports.PHASE.sync);
        idata.write(memory_map_ts_1.IDATA.diagTimeout, TIMEOUT_RELOAD);
        idata.write(memory_map_ts_1.IDATA.diagRemainingLength, 0);
        idata.write(memory_map_ts_1.IDATA.diagDataPointer, 0);
        idata.write(memory_map_ts_1.IDATA.diagCommand, 0);
        this.received = [];
        this.awaitingEcho = false;
    }
    phase() {
        return this.context.machine.idata.read(memory_map_ts_1.IDATA.diagPhase);
    }
    setPhase(phase) {
        this.context.machine.idata.write(memory_map_ts_1.IDATA.diagPhase, phase);
    }
    /** Called from the foreground cycle. Drives 0x55, timeouts, and byte intake. */
    service() {
        if (this.phase() === exports.PHASE.sync) {
            this.transmit(kw71_framing_ts_1.SYNC_BYTE);
            this.setPhase(exports.PHASE.keyword);
            return;
        }
        if (this.uart.hasPendingByte()) {
            this.dispatch(this.uart.takePendingByte());
            return;
        }
        this.countdown();
    }
    /** Timeouts decrement INTMEM:0032; expiry calls CODE:8943. */
    countdown() {
        const { idata } = this.context.machine;
        const { expired } = idata.decrementToZero(memory_map_ts_1.IDATA.diagTimeout);
        if (!expired)
            return;
        this.uart.onTimeout();
        this.reset();
    }
    /** CODE:8a1b — dispatch the byte to the routine for the current phase. */
    dispatch(byte) {
        const { idata } = this.context.machine;
        idata.write(memory_map_ts_1.IDATA.diagTimeout, TIMEOUT_RELOAD);
        if (this.awaitingEcho) {
            // CODE:8aa0 — the byte must be the complement of what was just sent.
            if (!(0, kw71_framing_ts_1.isValidEcho)(byte, this.lastSent)) {
                this.reset();
                return;
            }
            this.awaitingEcho = false;
            return;
        }
        switch (this.phase()) {
            case exports.PHASE.keyword:
                this.keywordExchange(byte);
                return;
            case exports.PHASE.ready:
                this.acceptLength(byte);
                return;
            case exports.PHASE.length:
                this.acceptLength(byte);
                return;
            case exports.PHASE.body:
                this.acceptBodyByte(byte);
                return;
            default:
                this.reset();
        }
    }
    /** CODE:774f — 0x06 in the startup state advances the session, updating the
     *  paged XRAM protocol state and calling 8475. */
    keywordExchange(byte) {
        const { xram } = this.context.machine;
        if (byte === kw71_framing_ts_1.HANDSHAKE_BYTE) {
            xram.write(memory_map_ts_1.XRAM.diagFrameSequence, 0);
            this.establish();
            return;
        }
        // Otherwise this is a keyword byte: answer with its complement.
        this.transmit((0, kw71_framing_ts_1.complement)(byte));
    }
    /** CODE:8475 — session established. */
    establish() {
        this.setPhase(exports.PHASE.ready);
        this.received = [];
    }
    /** CODE:8afd — a length byte no greater than 0x10. */
    acceptLength(byte) {
        if (!(0, kw71_framing_ts_1.isAcceptableLength)(byte)) {
            this.reset();
            return;
        }
        const { idata } = this.context.machine;
        idata.write(memory_map_ts_1.IDATA.diagRemainingLength, byte);
        idata.write(memory_map_ts_1.IDATA.diagDataPointer, 0);
        this.received = [];
        this.setPhase(exports.PHASE.body);
        this.transmit((0, kw71_framing_ts_1.complement)(byte));
    }
    /** CODE:8b36 — store, decrement remaining, complement, transmit. */
    acceptBodyByte(byte) {
        const { idata } = this.context.machine;
        this.received.push(byte);
        idata.write(memory_map_ts_1.IDATA.diagDataPointer, this.received.length);
        const { expired } = idata.decrementToZero(memory_map_ts_1.IDATA.diagRemainingLength);
        if (byte === kw71_framing_ts_1.BLOCK_TERMINATOR || expired) {
            this.completeBlock();
            return;
        }
        this.transmit((0, kw71_framing_ts_1.complement)(byte));
    }
    /** CODE:8b70 — the block is complete; answer it. */
    completeBlock() {
        const bytes = this.received;
        this.received = [];
        this.setPhase(exports.PHASE.ready);
        const sequence = bytes[0] ?? 0;
        const service = bytes[1] ?? 0;
        const payload = bytes.slice(2).filter((b) => b !== kw71_framing_ts_1.BLOCK_TERMINATOR);
        this.context.machine.idata.write(memory_map_ts_1.IDATA.diagCommand, service);
        const response = (0, kw71_services_ts_1.handleService)(this.services, service, payload);
        this.sendBlock((0, byte_math_ts_1.u8)(sequence + 1), response.service, response.payload);
    }
    /** Assemble an outgoing frame in XRAM 00b1-00b4 and put it on the wire. */
    sendBlock(sequence, service, payload) {
        const { xram } = this.context.machine;
        const block = {
            length: payload.length + 3,
            sequence,
            service,
            payload: [...payload],
        };
        xram.write(memory_map_ts_1.XRAM.diagFrameLength, block.length);
        xram.write(memory_map_ts_1.XRAM.diagFrameSequence, block.sequence);
        xram.write(memory_map_ts_1.XRAM.diagFrameService, block.service);
        for (let i = 0; i < block.payload.length; i += 1) {
            xram.write(memory_map_ts_1.XRAM.diagFramePayload + i, block.payload[i]);
        }
        for (const byte of (0, kw71_framing_ts_1.serializeBlock)(block))
            this.transmit(byte);
    }
    transmit(byte) {
        this.lastSent = (0, byte_math_ts_1.u8)(byte);
        this.context.machine.idata.write(memory_map_ts_1.IDATA.diagByte, this.lastSent);
        this.uart.send(this.lastSent);
    }
    /** Protocol-state mismatch, bad length, or bad echo: roll back. */
    reset() {
        this.received = [];
        this.awaitingEcho = false;
        const { idata } = this.context.machine;
        idata.write(memory_map_ts_1.IDATA.diagRemainingLength, 0);
        idata.write(memory_map_ts_1.IDATA.diagDataPointer, 0);
        idata.write(memory_map_ts_1.IDATA.diagTimeout, TIMEOUT_RELOAD);
        this.setPhase(exports.PHASE.sync);
    }
}
exports.Kw71Session = Kw71Session;
