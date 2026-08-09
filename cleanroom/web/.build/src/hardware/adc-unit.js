"use strict";
/**
 * SAB80C515 ADC: ADCON0, ADDAT, DAPR.
 *
 * CODE:9ec2 is proven to be a blocking read:
 *   `ADCON0 = (ADCON0 & 0xf8) | (channel & 7); DAPR = 0; wait; result = ADDAT`
 *
 * The ADC interrupt wrapper at 2080 is a direct RETI, so acquisition is polled.
 * This model therefore completes a conversion synchronously and never pends the
 * ADC interrupt — the wrapper exists, it just does nothing.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdcUnit = void 0;
const byte_math_ts_1 = require("../byte-math.js");
const memory_map_ts_1 = require("../memory-map.js");
/** Eight multiplexed inputs; the channel field is three bits wide. */
const CHANNELS = 8;
class AdcUnit {
    /** Physical input level per channel, 8-bit. Driven by the test bench or a
     *  plant model, never by firmware code. */
    inputs = new Uint8Array(CHANNELS);
    conversions = 0;
    sfr;
    constructor(sfr) {
        this.sfr = sfr;
    }
    /** Bench-side: set what the pin is presenting. */
    setInput(channel, raw) {
        this.inputs[channel & 0x07] = (0, byte_math_ts_1.u8)(raw);
    }
    getInput(channel) {
        return this.inputs[channel & 0x07];
    }
    /** CODE:9ec2. Selects the channel, starts the conversion via DAPR, waits,
     *  and returns ADDAT. */
    convert(channel) {
        this.sfr.update(memory_map_ts_1.SFR.ADCON0, (current) => (current & 0xf8) | (channel & 0x07));
        this.sfr.write(memory_map_ts_1.SFR.DAPR, 0);
        const result = this.inputs[channel & 0x07];
        this.sfr.write(memory_map_ts_1.SFR.ADDAT, result);
        this.conversions += 1;
        return result;
    }
    /** Last conversion result, for the paths that read ADDAT directly
     *  (CODE:2ce8 in the AFM path, CODE:261c after starting channel 0). */
    latest() {
        return this.sfr.read(memory_map_ts_1.SFR.ADDAT);
    }
    /** Start a conversion without consuming it, as CODE:261c does for channel 0. */
    start(channel) {
        this.convert(channel);
    }
    conversionCount() {
        return this.conversions;
    }
    reset() {
        this.conversions = 0;
        this.sfr.write(memory_map_ts_1.SFR.ADCON0, 0);
        this.sfr.write(memory_map_ts_1.SFR.ADDAT, 0);
        this.sfr.write(memory_map_ts_1.SFR.DAPR, 0);
    }
}
exports.AdcUnit = AdcUnit;
