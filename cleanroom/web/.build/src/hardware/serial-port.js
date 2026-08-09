"use strict";
/**
 * UART used by the KW71 diagnostic link.
 *
 * Proven behaviour: the serial vector 0023 reaches CODE:8960, which disables
 * the serial interrupt, selects `SCON = 0x90` or `0xfa` from a mode bit, and
 * returns. CODE:8919 configures SCON, writes one byte to SBUF, and re-enables
 * the serial interrupt. Transmission completion and byte reception both raise
 * the serial interrupt, so this model pends `serial` on either.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SerialPort = exports.SCON_MODE_B = exports.SCON_MODE_A = void 0;
const byte_math_ts_1 = require("../byte-math.js");
const memory_map_ts_1 = require("../memory-map.js");
/** SCON values the firmware selects between (CODE:8960). */
exports.SCON_MODE_A = 0x90;
exports.SCON_MODE_B = 0xfa;
/** SCON.RI and SCON.TI. */
const RI = 0;
const TI = 1;
class SerialPort {
    rxQueue = [];
    /** Bytes the ECU has put on the wire, in order. */
    txLog = [];
    txRemaining = 0;
    interruptEnabled = false;
    sfr;
    onInterrupt;
    /** Ticks per character, derived from the assumed baud rate. */
    ticksPerByte;
    constructor(sfr, onInterrupt, ticksPerByte) {
        this.sfr = sfr;
        this.onInterrupt = onInterrupt;
        this.ticksPerByte = ticksPerByte;
    }
    configure(scon) {
        this.sfr.write(memory_map_ts_1.SFR.SCON, (0, byte_math_ts_1.u8)(scon));
    }
    enableInterrupt(on) {
        this.interruptEnabled = on;
    }
    /** CODE:8919 — load SBUF and start shifting. */
    transmit(byte) {
        this.sfr.write(memory_map_ts_1.SFR.SBUF, (0, byte_math_ts_1.u8)(byte));
        this.txLog.push((0, byte_math_ts_1.u8)(byte));
        this.txRemaining = this.ticksPerByte;
    }
    /** Bench-side: a byte arriving from the tester. */
    deliver(byte) {
        this.rxQueue.push((0, byte_math_ts_1.u8)(byte));
        this.pumpReceive();
    }
    /** True when a received byte is waiting in SBUF. */
    hasReceived() {
        return this.sfr.getBit(memory_map_ts_1.SFR.SCON, RI);
    }
    /** Consume the received byte and clear RI, as a handler does. */
    takeReceived() {
        const byte = this.sfr.read(memory_map_ts_1.SFR.SBUF);
        this.sfr.setBit(memory_map_ts_1.SFR.SCON, RI, false);
        this.pumpReceive();
        return byte;
    }
    transmitComplete() {
        return this.sfr.getBit(memory_map_ts_1.SFR.SCON, TI);
    }
    clearTransmitFlag() {
        this.sfr.setBit(memory_map_ts_1.SFR.SCON, TI, false);
    }
    advance(ticks) {
        if (this.txRemaining <= 0)
            return;
        this.txRemaining -= ticks;
        if (this.txRemaining > 0)
            return;
        this.txRemaining = 0;
        this.sfr.setBit(memory_map_ts_1.SFR.SCON, TI, true);
        if (this.interruptEnabled)
            this.onInterrupt();
    }
    pumpReceive() {
        if (this.sfr.getBit(memory_map_ts_1.SFR.SCON, RI))
            return;
        const next = this.rxQueue.shift();
        if (next === undefined)
            return;
        this.sfr.write(memory_map_ts_1.SFR.SBUF, next);
        this.sfr.setBit(memory_map_ts_1.SFR.SCON, RI, true);
        if (this.interruptEnabled)
            this.onInterrupt();
    }
    reset() {
        this.rxQueue.length = 0;
        this.txLog.length = 0;
        this.txRemaining = 0;
        this.interruptEnabled = false;
        this.sfr.write(memory_map_ts_1.SFR.SCON, 0);
        this.sfr.write(memory_map_ts_1.SFR.SBUF, 0);
    }
}
exports.SerialPort = SerialPort;
