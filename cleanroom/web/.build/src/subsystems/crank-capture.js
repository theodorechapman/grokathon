"use strict";
/**
 * Capture worker, CODE:2462.
 *
 * Proven: it "reads CRCL, CRCH, TH2, and INTMEM:003f, stores timestamp triplets
 * through the pointer in INTMEM:004f, and advances that pointer by three
 * bytes", and it "includes a rollover correction when captured CRCH disagrees
 * with live TH2, proving that capture timestamps cross the 16-bit Timer-2
 * boundary". The timer-2 wrapper at 2070-2074 maintains the epoch byte.
 *
 * Where the triplet buffer lives is not recovered; this model puts it in
 * indirectly-addressable internal RAM and says so. Everything else here is the
 * specification's mechanism, unchanged.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CrankCapture = exports.TIMESTAMP_BUFFER_TRIPLETS = exports.TIMESTAMP_BUFFER_BASE = void 0;
const memory_map_ts_1 = require("../memory-map.js");
const byte_math_ts_1 = require("../byte-math.js");
/** Model-chosen location for the triplet ring. Upper internal RAM, indirect. */
exports.TIMESTAMP_BUFFER_BASE = 0x80;
exports.TIMESTAMP_BUFFER_TRIPLETS = 8;
const TRIPLET_BYTES = 3;
class CrankCapture {
    events = [];
    rolloverCorrections = 0;
    context;
    constructor(context) {
        this.context = context;
    }
    initialise() {
        const { idata } = this.context.machine;
        idata.write(memory_map_ts_1.IDATA.timestampPointer, exports.TIMESTAMP_BUFFER_BASE);
        idata.write(memory_map_ts_1.IDATA.capturePhase, 0);
        idata.write(memory_map_ts_1.IDATA.timer2OverflowEpoch, 0);
    }
    /** CODE:2070-2074 — increment the epoch and clear IRCON.TF2. */
    onTimer2Overflow() {
        const { idata, sfr } = this.context.machine;
        idata.increment(memory_map_ts_1.IDATA.timer2OverflowEpoch);
        sfr.setBit(memory_map_ts_1.SFR.IRCON, 6, false);
    }
    /** CODE:2462. */
    service() {
        const { idata, sfr } = this.context.machine;
        const low = sfr.read(memory_map_ts_1.SFR.CRCL);
        const high = sfr.read(memory_map_ts_1.SFR.CRCH);
        const liveHigh = sfr.read(memory_map_ts_1.SFR.TH2);
        let epoch = idata.read(memory_map_ts_1.IDATA.timer2OverflowEpoch);
        // Rollover correction: the capture latched before an overflow that the
        // epoch byte has already counted.
        let corrected = false;
        if (high > liveHigh) {
            epoch = (0, byte_math_ts_1.u8)(epoch - 1);
            corrected = true;
            this.rolloverCorrections += 1;
        }
        this.storeTriplet(epoch, high, low);
        idata.increment(memory_map_ts_1.IDATA.capturePhase);
        const event = {
            timestamp: (0, byte_math_ts_1.timestamp24)(epoch, high, low),
            epoch,
            high,
            low,
            rolloverCorrected: corrected,
        };
        this.events.push(event);
        if (this.events.length > exports.TIMESTAMP_BUFFER_TRIPLETS)
            this.events.shift();
        return event;
    }
    /** Store `epoch:high:low` through INTMEM:004f and advance it by three. */
    storeTriplet(epoch, high, low) {
        const { idata } = this.context.machine;
        let pointer = idata.read(memory_map_ts_1.IDATA.timestampPointer);
        const limit = exports.TIMESTAMP_BUFFER_BASE + exports.TIMESTAMP_BUFFER_TRIPLETS * TRIPLET_BYTES;
        if (pointer < exports.TIMESTAMP_BUFFER_BASE || pointer + TRIPLET_BYTES > limit) {
            pointer = exports.TIMESTAMP_BUFFER_BASE;
        }
        idata.write(pointer, epoch);
        idata.write(pointer + 1, high);
        idata.write(pointer + 2, low);
        idata.write(memory_map_ts_1.IDATA.timestampPointer, pointer + TRIPLET_BYTES);
    }
    /** Period between the last two captures, in timer ticks, or null. */
    lastPeriod() {
        if (this.events.length < 2)
            return null;
        const latest = this.events[this.events.length - 1];
        const previous = this.events[this.events.length - 2];
        return (latest.timestamp - previous.timestamp) & 0xffffff;
    }
    capturePhase() {
        return this.context.machine.idata.read(memory_map_ts_1.IDATA.capturePhase);
    }
    corrections() {
        return this.rolloverCorrections;
    }
}
exports.CrankCapture = CrankCapture;
