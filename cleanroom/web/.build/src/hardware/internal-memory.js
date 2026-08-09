"use strict";
/**
 * Internal 8051 data memory: 256 direct/indirect bytes plus the bit-addressable
 * window. The specification distinguishes `INTMEM:xx` from `BITS:xx`; both live
 * here, because on an 8051 bit address `b` is byte `0x20 + (b >> 3)`, bit
 * `b & 7`. Keeping the aliasing real means a test can prove that `BITS:0038`
 * and the byte holding it are the same storage.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.InternalMemory = void 0;
const byte_math_ts_1 = require("../byte-math.js");
class InternalMemory {
    cells = new Uint8Array(0x100);
    read(address) {
        return this.cells[address & 0xff];
    }
    write(address, value) {
        this.cells[address & 0xff] = (0, byte_math_ts_1.u8)(value);
    }
    /** Read a 16-bit value stored high byte first, as the capture and pointer
     *  pairs in the specification are. */
    readWord(address) {
        return (this.read(address) << 8) | this.read(address + 1);
    }
    writeWord(address, value) {
        this.write(address, (value >> 8) & 0xff);
        this.write(address + 1, value & 0xff);
    }
    increment(address) {
        const next = (0, byte_math_ts_1.u8)(this.read(address) + 1);
        this.write(address, next);
        return next;
    }
    /** Decrement with a floor at zero, and report whether it reached zero. The
     *  heartbeat and every countdown in the specification behave this way. */
    decrementToZero(address) {
        const current = this.read(address);
        if (current === 0)
            return { value: 0, expired: true };
        const next = current - 1;
        this.write(address, next);
        return { value: next, expired: next === 0 };
    }
    /** Byte holding bit-addressable bit `bitAddress` (0x00-0x7f). */
    static bitByte(bitAddress) {
        return 0x20 + ((bitAddress & 0x7f) >> 3);
    }
    getBit(bitAddress) {
        return (0, byte_math_ts_1.bitGet)(this.read(InternalMemory.bitByte(bitAddress)), bitAddress & 7);
    }
    setBit(bitAddress, on) {
        const byte = InternalMemory.bitByte(bitAddress);
        this.write(byte, (0, byte_math_ts_1.bitWrite)(this.read(byte), bitAddress & 7, on));
    }
    /** Clear the whole space. Reset behaviour, not a routine the spec names. */
    clear() {
        this.cells.fill(0);
    }
    snapshot() {
        return this.cells.slice();
    }
}
exports.InternalMemory = InternalMemory;
