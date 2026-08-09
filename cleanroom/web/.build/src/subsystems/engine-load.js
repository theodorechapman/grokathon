"use strict";
/**
 * Load calculation and operating-mode selection.
 *
 * Proven: "CODE:6099 derives normalized load 0040 and encoded speed 003b", and
 * "CODE:3610 compares descriptor-backed state at INTMEM:003b and 0040, and uses
 * bits 3-5 of page-relative EXTMEM:007a to select one of several record
 * fields", probing "logical descriptors until the lookup service reports a 0xff
 * selector".
 *
 * The load *equation* is not proven, and SPECS explicitly declines to import
 * `load = air_mass / engine_speed` from Motronic literature. This model uses
 * that form anyway because it has to produce a number — it is an assumption,
 * flagged here and nowhere else. The addresses, the comparison inputs, the mode
 * field and the probe-until-0xff walk are the specification's.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EngineLoad = void 0;
const byte_math_ts_1 = require("../byte-math.js");
const memory_map_ts_1 = require("../memory-map.js");
/** Mode field occupies bits 3-5 of the page-relative byte at EXTMEM:007a. */
const MODE_SHIFT = 3;
const MODE_MASK = 0x07;
/** Thresholds in the normalized byte domain. SPECS: "exact TPS/load thresholds
 *  are not named" — these are model values. */
const THRESHOLDS = {
    crankingRpm: 400,
    idleUpperRpm: 1100,
    idleUpperLoad: 0x50,
    wotLoad: 0xc0,
};
/** Scale relating filtered air mass and speed to the normalized load byte.
 *  Chosen so that air flow rising in proportion with speed — which is what an
 *  open throttle does — saturates the byte, and a closed throttle sits near
 *  zero at any speed. Assumed. */
const LOAD_GAIN = 176;
class EngineLoad {
    mode = 'stopped';
    context;
    airMass;
    sync;
    constructor(context, airMass, sync) {
        this.context = context;
        this.airMass = airMass;
        this.sync = sync;
    }
    /** CODE:6099. */
    update() {
        const { idata, assumptions } = this.context.machine;
        const speed = this.sync.speed();
        const rpm = speed?.rpm ?? 0;
        idata.write(memory_map_ts_1.IDATA.encodedEngineSpeed, (0, byte_math_ts_1.sat8)(Math.round(rpm / assumptions.rpmPerSpeedCount)));
        const speedCounts = Math.max(1, idata.read(memory_map_ts_1.IDATA.encodedEngineSpeed));
        const load = (0, byte_math_ts_1.sat8)(Math.round((this.airMass.filteredByte() * LOAD_GAIN) / speedCounts));
        idata.write(memory_map_ts_1.IDATA.normalizedLoad, load);
        this.mode = this.classify(rpm, load);
        this.writeModeField(this.mode);
    }
    classify(rpm, load) {
        if (rpm <= 0)
            return 'stopped';
        if (rpm < THRESHOLDS.crankingRpm)
            return 'cranking';
        if (load >= THRESHOLDS.wotLoad)
            return 'wide-open-throttle';
        if (rpm <= THRESHOLDS.idleUpperRpm && load <= THRESHOLDS.idleUpperLoad)
            return 'idle';
        return 'part-load';
    }
    writeModeField(mode) {
        const index = {
            stopped: 0,
            cranking: 1,
            idle: 2,
            'part-load': 3,
            'wide-open-throttle': 4,
        };
        const { xram } = this.context.machine;
        const current = xram.read(memory_map_ts_1.XRAM.modeField);
        const cleared = current & ~(MODE_MASK << MODE_SHIFT);
        xram.write(memory_map_ts_1.XRAM.modeField, cleared | ((index[mode] & MODE_MASK) << MODE_SHIFT));
    }
    /** Bits 3-5 of EXTMEM:007a, the field CODE:3610 selects on. */
    modeBits() {
        return (this.context.machine.xram.read(memory_map_ts_1.XRAM.modeField) >> MODE_SHIFT) & MODE_MASK;
    }
    operatingMode() {
        return this.mode;
    }
    /** CODE:3610 — probe logical descriptors until the service reports 0xff,
     *  then compare live state. Returns everything the probe found. */
    probe() {
        return this.context.lookup.walk(0);
    }
    /** The two comparison inputs CODE:3610 reads. */
    comparisonInputs() {
        const { idata } = this.context.machine;
        return {
            encodedSpeed: idata.read(memory_map_ts_1.IDATA.encodedEngineSpeed),
            normalizedLoad: idata.read(memory_map_ts_1.IDATA.normalizedLoad),
        };
    }
}
exports.EngineLoad = EngineLoad;
