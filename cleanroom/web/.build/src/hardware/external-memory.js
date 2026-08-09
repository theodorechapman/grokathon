"use strict";
/**
 * Paged external RAM.
 *
 * SPECS repeatedly flags that `MOVX @Ri` combines an 8-bit offset with the page
 * register, and that page reconstruction is required before some offsets can be
 * named. This model therefore keeps page and offset separate at the API: a
 * caller either supplies a full 16-bit address it knows, or a page plus offset.
 * Nothing silently assumes page 0.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExternalMemory = void 0;
const byte_math_ts_1 = require("../byte-math.js");
/** 2 KiB covers every address the specification names (up to 0x03fe). */
const SIZE = 0x0800;
class ExternalMemory {
    cells = new Uint8Array(SIZE);
    /** The `P2` page latch used by `MOVX @Ri`. */
    page = 0;
    selectPage(page) {
        this.page = (0, byte_math_ts_1.u8)(page);
    }
    currentPage() {
        return this.page;
    }
    read(address) {
        return this.cells[address % SIZE];
    }
    write(address, value) {
        this.cells[address % SIZE] = (0, byte_math_ts_1.u8)(value);
    }
    /** `MOVX A,@Ri` — offset within the currently selected page. */
    readPaged(offset) {
        return this.read((this.page << 8) | (0, byte_math_ts_1.u8)(offset));
    }
    /** `MOVX @Ri,A` — offset within the currently selected page. */
    writePaged(offset, value) {
        this.write((this.page << 8) | (0, byte_math_ts_1.u8)(offset), value);
    }
    readWord(address) {
        return (this.read(address) << 8) | this.read(address + 1);
    }
    writeWord(address, value) {
        this.write(address, (value >> 8) & 0xff);
        this.write(address + 1, value & 0xff);
    }
    fill(from, to, value) {
        for (let a = from; a <= to; a += 1)
            this.write(a, value);
    }
    copyIn(address, bytes) {
        for (let i = 0; i < bytes.length; i += 1)
            this.write(address + i, bytes[i]);
    }
    slice(from, length) {
        const out = new Uint8Array(length);
        for (let i = 0; i < length; i += 1)
            out[i] = this.read(from + i);
        return out;
    }
    clear() {
        this.cells.fill(0);
    }
    snapshot() {
        return this.cells.slice();
    }
}
exports.ExternalMemory = ExternalMemory;
