"use strict";
/**
 * Sensor monitors and fallback behaviour.
 *
 * Proven: "CODE:9158 compares measured channels INTMEM:0036-003a against ROM
 * thresholds. Qualified active records can substitute calibrated defaults and
 * invoke neutralization helpers. CODE:93ff performs additional plausibility
 * checks; 6de3 explicitly restores XRAM 0046 and 0049 to neutral 0x80."
 *
 * Also proven, and reused by the integrity chapter: "ROM and RAM tests report
 * the same fault-table identifier at CODE:4532 with different subtypes: RAM
 * uses 1 and ROM checksum uses 4."
 *
 * The thresholds themselves are not recoverable from the XDF — SPECS: "Exact
 * open-circuit/short-circuit thresholds cannot be named from the XDF because
 * the XDF primarily describes calibrations rather than ADC diagnostic
 * thresholds." The window below is a model choice: rails only, which is the
 * one thing an open or shorted input reliably produces.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FaultMonitors = exports.MONITORED_CHANNELS = exports.SUBTYPE = exports.FAULT_TABLE_IDENTIFIER = void 0;
const byte_math_ts_1 = require("../byte-math.js");
const memory_map_ts_1 = require("../memory-map.js");
/** The identifier both integrity tests report, quoted from SPECS. */
exports.FAULT_TABLE_IDENTIFIER = 0x4532 & 0xff;
/** Subtypes proven for that identifier. */
exports.SUBTYPE = { ramTest: 1, romChecksum: 4 };
/** One monitor per measured channel. Identifiers are model-assigned: SPECS
 *  says "Unknown: BMW fault-code names". */
exports.MONITORED_CHANNELS = [
    { address: memory_map_ts_1.IDATA.scaledSupplyVoltage, identifier: 0x11, name: 'supply', fallback: 0xa0 },
    { address: memory_map_ts_1.IDATA.intakeAirTemperature, identifier: 0x12, name: 'intake air', fallback: 0x80 },
    { address: memory_map_ts_1.IDATA.coolantTemperature, identifier: 0x13, name: 'coolant', fallback: 0x80 },
    { address: memory_map_ts_1.IDATA.hystereticChannel, identifier: 0x14, name: 'hysteretic', fallback: byte_math_ts_1.NEUTRAL },
    { address: memory_map_ts_1.IDATA.unresolvedChannel, identifier: 0x15, name: 'unresolved', fallback: byte_math_ts_1.NEUTRAL },
];
/** Rail window. Values at either rail read as open or shorted. */
const LOWER_RAIL = 0x02;
const UPPER_RAIL = 0xfd;
class FaultMonitors {
    /** Consecutive out-of-range passes per channel, before qualification. */
    strikes = new Map();
    qualifyAfter = 3;
    context;
    faults;
    constructor(context, faults) {
        this.context = context;
        this.faults = faults;
    }
    /** CODE:9158 — compare measured channels against thresholds. */
    checkChannels() {
        const { idata } = this.context.machine;
        for (const channel of exports.MONITORED_CHANNELS) {
            const value = idata.read(channel.address);
            const bad = value <= LOWER_RAIL || value >= UPPER_RAIL;
            const strikes = bad ? (this.strikes.get(channel.address) ?? 0) + 1 : 0;
            this.strikes.set(channel.address, strikes);
            if (!bad) {
                this.faults.clearActive(channel.identifier);
                continue;
            }
            if (strikes < this.qualifyAfter)
                continue;
            this.faults.report(channel.identifier, value <= LOWER_RAIL ? 1 : 2, value, 0);
            // A qualified active record substitutes the calibrated default.
            idata.write(channel.address, channel.fallback);
        }
    }
    /** CODE:93ff — additional plausibility checks across channels. */
    checkPlausibility() {
        const { idata } = this.context.machine;
        const coolant = idata.read(memory_map_ts_1.IDATA.coolantTemperature);
        const intake = idata.read(memory_map_ts_1.IDATA.intakeAirTemperature);
        // Both temperature channels sitting at opposite rails cannot both be true.
        if (coolant <= LOWER_RAIL && intake >= UPPER_RAIL) {
            this.faults.report(0x16, 3, coolant, intake);
            this.neutraliseFallbackCells();
        }
    }
    /** CODE:6de3 — restore XRAM 0046 and 0049 to neutral 0x80. */
    neutraliseFallbackCells() {
        const { xram } = this.context.machine;
        xram.write(memory_map_ts_1.XRAM.fallbackCellA, byte_math_ts_1.NEUTRAL);
        xram.write(memory_map_ts_1.XRAM.fallbackCellB, byte_math_ts_1.NEUTRAL);
    }
    /** True when any monitor holds a currently-active qualified record. This is
     *  what disables adaptation. */
    anyActive() {
        return this.faults.all().some((record) => ((record.status >> 6) & 1) === 1);
    }
}
exports.FaultMonitors = FaultMonitors;
