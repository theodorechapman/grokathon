"use strict";
/**
 * Digital port bits.
 *
 * SPECS is explicit that the firmware-to-PCB mapping was never recovered: DME
 * pin numbers are known from BMW wiring, but which MCU port bit reaches which
 * pin is not. Two port bits *are* named by the diagnostics chapter, because the
 * actuator-test decoder drives them directly: P1.2 alongside CC2 and P1.3
 * alongside CC3.
 *
 * Every other bit is a model-local name with no pin claim attached.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DigitalPorts = exports.NAMED_PORT_BITS = void 0;
const byte_math_ts_1 = require("../byte-math.js");
const memory_map_ts_1 = require("../memory-map.js");
/** The only two port bits the specification ties to a function. */
exports.NAMED_PORT_BITS = {
    /** Driven with compare channel 2 by the periodic actuator service (8000). */
    p1_2: 2,
    /** Driven with compare channel 3 by the periodic actuator service (8000). */
    p1_3: 3,
};
class DigitalPorts {
    transitions = [];
    sfr;
    constructor(sfr) {
        this.sfr = sfr;
    }
    setP1(bit, value) {
        const before = (0, byte_math_ts_1.bitGet)(this.sfr.read(memory_map_ts_1.SFR.P1), bit);
        this.sfr.write(memory_map_ts_1.SFR.P1, (0, byte_math_ts_1.bitWrite)(this.sfr.read(memory_map_ts_1.SFR.P1), bit, value));
        if (before !== value)
            this.transitions.push({ port: 'P1', bit, value });
    }
    getP1(bit) {
        return (0, byte_math_ts_1.bitGet)(this.sfr.read(memory_map_ts_1.SFR.P1), bit);
    }
    pulseP1(bit) {
        this.setP1(bit, true);
        this.setP1(bit, false);
    }
    reset() {
        this.transitions.length = 0;
        this.sfr.write(memory_map_ts_1.SFR.P1, 0);
    }
}
exports.DigitalPorts = DigitalPorts;
