"use strict";
/**
 * Special function registers, 0x80-0xff.
 *
 * Peripherals in this model own their behaviour but store their state here, so
 * the register image is real: a test can read `SFR.ADCON0` after a conversion
 * and see the channel field the firmware wrote.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SfrFile = void 0;
const byte_math_ts_1 = require("../byte-math.js");
class SfrFile {
    cells = new Uint8Array(0x80);
    read(address) {
        return this.cells[(address & 0xff) - 0x80];
    }
    write(address, value) {
        this.cells[(address & 0xff) - 0x80] = (0, byte_math_ts_1.u8)(value);
    }
    update(address, transform) {
        const next = (0, byte_math_ts_1.u8)(transform(this.read(address)));
        this.write(address, next);
        return next;
    }
    getBit(address, bit) {
        return (0, byte_math_ts_1.bitGet)(this.read(address), bit);
    }
    setBit(address, bit, on) {
        this.write(address, (0, byte_math_ts_1.bitWrite)(this.read(address), bit, on));
    }
    /** High-byte-first register pair, the layout of CRCH:CRCL and TH2:TL2. */
    readPair(highAddress, lowAddress) {
        return (this.read(highAddress) << 8) | this.read(lowAddress);
    }
    writePair(highAddress, lowAddress, value) {
        this.write(highAddress, (value >> 8) & 0xff);
        this.write(lowAddress, value & 0xff);
    }
    clear() {
        this.cells.fill(0);
    }
    snapshot() {
        return this.cells.slice();
    }
}
exports.SfrFile = SfrFile;
