"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.Kw71Uart = void 0;
const memory_map_ts_1 = require("../memory-map.js");
const serial_port_ts_1 = require("../hardware/serial-port.js");
class Kw71Uart {
    /** The mode bit 8960 selects SCON from. Its meaning is not recovered. */
    modeBit = false;
    pending = false;
    /** The runtime condition under which 8943 re-enters initialisation. */
    reinitialiseOnTimeout = false;
    context;
    constructor(context) {
        this.context = context;
    }
    setModeBit(on) {
        this.modeBit = on;
    }
    /** CODE:8960 — serial vector worker. */
    onSerialInterrupt() {
        const { machine } = this.context;
        machine.serial.enableInterrupt(false);
        // The byte comes out of SBUF before SCON is rewritten: selecting the mode
        // word overwrites RI and TI along with everything else.
        if (machine.serial.hasReceived()) {
            machine.idata.write(memory_map_ts_1.IDATA.diagByte, machine.serial.takeReceived());
            this.pending = true;
        }
        if (machine.serial.transmitComplete())
            machine.serial.clearTransmitFlag();
        machine.serial.configure(this.modeBit ? serial_port_ts_1.SCON_MODE_B : serial_port_ts_1.SCON_MODE_A);
    }
    /** A byte is waiting in INTMEM:0035. */
    hasPendingByte() {
        return this.pending;
    }
    takePendingByte() {
        this.pending = false;
        return this.context.machine.idata.read(memory_map_ts_1.IDATA.diagByte);
    }
    /** CODE:8919 — configure, transmit, re-enable. */
    send(byte) {
        const { machine } = this.context;
        machine.serial.configure(this.modeBit ? serial_port_ts_1.SCON_MODE_B : serial_port_ts_1.SCON_MODE_A);
        machine.serial.transmit(byte);
        machine.serial.enableInterrupt(true);
    }
    /** CODE:8943 — timeout recovery. */
    onTimeout() {
        const { machine } = this.context;
        machine.serial.configure(serial_port_ts_1.SCON_MODE_A);
        machine.serial.enableInterrupt(true);
        this.pending = false;
        if (this.reinitialiseOnTimeout)
            this.context.restart('serial-timeout-8943');
    }
    /** Bytes the ECU has put on the wire. */
    transmitted() {
        return this.context.machine.serial.txLog;
    }
}
exports.Kw71Uart = Kw71Uart;
