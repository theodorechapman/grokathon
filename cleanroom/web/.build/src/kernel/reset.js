"use strict";
/**
 * Reset entry, CODE:0000.
 *
 * The deterministic emulator trace in SPECS is exact, and this reproduces it:
 *
 *   0000 -> 0073 -> 0075 -> 0077 -> 0079 -> 007b -> 20e0 -> 5c00
 *
 * "The instructions at 0073-007b copy IP0.6 (WDTS, the watchdog reset status)
 * into PSW F0, set IEN1.SWDT, and jump to 20e0. 20e0 is a trampoline to 5c00."
 *
 * The trace is returned so a test can assert on the sequence itself, which is
 * the single highest-confidence fact in the whole specification.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.watchdogResetFlag = exports.runReset = exports.RESET_TRACE = void 0;
const memory_map_ts_1 = require("../memory-map.js");
exports.RESET_TRACE = [0x0000, 0x0073, 0x0075, 0x0077, 0x0079, 0x007b, 0x20e0, 0x5c00];
/** Runs the wrapper at 0073-007b and hands control to the trampoline. */
const runReset = (machine) => {
    const trace = [0x0000, 0x0073];
    // 0073-0074: read IP0.6 (WDTS) and preserve it in PSW.F0.
    const watchdogReset = machine.sfr.getBit(memory_map_ts_1.SFR.IP0, memory_map_ts_1.SFR_BITS.IP0_WDTS);
    machine.sfr.setBit(memory_map_ts_1.SFR.PSW, memory_map_ts_1.SFR_BITS.PSW_F0, watchdogReset);
    trace.push(0x0075);
    // 0075-007a: start the watchdog through IEN1.SWDT.
    machine.watchdog.start();
    trace.push(0x0077, 0x0079);
    // 007b: jump to the trampoline, which jumps to initialisation.
    trace.push(0x007b, 0x20e0, 0x5c00);
    return { trace, watchdogReset };
};
exports.runReset = runReset;
/** PSW.F0 as left by the reset wrapper. */
const watchdogResetFlag = (machine) => machine.sfr.getBit(memory_map_ts_1.SFR.PSW, memory_map_ts_1.SFR_BITS.PSW_F0);
exports.watchdogResetFlag = watchdogResetFlag;
