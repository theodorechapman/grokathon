"use strict";
/**
 * ADC acquisition.
 *
 * Proven, from SPECS:
 *  - CODE:9ec2 is a blocking channel read;
 *  - CODE:9e88 scans channels 1-5 into INTMEM:0036-003a;
 *  - CODE:261c starts channel 0;
 *  - CODE:2ce8 reads ADDAT directly in the AFM path;
 *  - the ADC interrupt wrapper at 2080 is a direct RETI, so acquisition is
 *    polled or synchronously scheduled — never interrupt-driven.
 *
 * Which connector signal each channel carries is not established by the binary.
 * The scan writes channels 1-5 to their proven destinations and says nothing
 * about what is on the other end.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdcAcquisition = exports.AFM_CHANNEL = exports.SCAN_DESTINATIONS = void 0;
const memory_map_ts_1 = require("../memory-map.js");
const byte_math_ts_1 = require("../byte-math.js");
/** The five channels CODE:9e88 sweeps, and where each result lands. */
exports.SCAN_DESTINATIONS = [
    { channel: 1, address: memory_map_ts_1.IDATA.adcChannel1 },
    { channel: 2, address: memory_map_ts_1.IDATA.adcChannel2 },
    { channel: 3, address: memory_map_ts_1.IDATA.adcChannel3 },
    { channel: 4, address: memory_map_ts_1.IDATA.adcChannel4 },
    { channel: 5, address: memory_map_ts_1.IDATA.adcChannel5 },
];
/** Channel started by CODE:261c; the AFM path consumes ADDAT separately. */
exports.AFM_CHANNEL = 0;
class AdcAcquisition {
    /** Low fraction left by the CODE:3fa0 gain stage, consumed by CODE:3f91. */
    supplyFraction = 0;
    context;
    constructor(context) {
        this.context = context;
    }
    /** CODE:9ec2 — blocking read of one channel. */
    readChannel(channel) {
        return this.context.machine.adc.convert(channel);
    }
    /** CODE:9e88 — sweep channels 1..5 into INTMEM:0036-003a. */
    scan() {
        const { idata } = this.context.machine;
        for (const { channel, address } of exports.SCAN_DESTINATIONS) {
            idata.write(address, this.readChannel(channel));
        }
    }
    /** CODE:261c — start the AFM channel without consuming the result. */
    startAfmConversion() {
        this.context.machine.adc.start(exports.AFM_CHANNEL);
    }
    /** CODE:2ce8 — read ADDAT directly in the AFM path. */
    readAfmSample() {
        return this.context.machine.adc.latest();
    }
    /**
     * CODE:3fa0 — calibrated gain applied to the supply channel:
     * `p = g * v; 0036 = min(255, p >> 7)`, with the low fraction handed on.
     */
    applySupplyGain(gain) {
        const { idata } = this.context.machine;
        const { stored, fraction } = (0, byte_math_ts_1.gainQ7)(gain, idata.read(memory_map_ts_1.IDATA.scaledSupplyVoltage));
        idata.write(memory_map_ts_1.IDATA.scaledSupplyVoltage, stored);
        this.supplyFraction = fraction;
        return stored;
    }
    /** The fraction CODE:3f91 consumes. */
    gainFraction() {
        return this.supplyFraction;
    }
}
exports.AdcAcquisition = AdcAcquisition;
