"use strict";
/**
 * Initialisation, CODE:5c00.
 *
 * "5c00 initializes runtime/XRAM sentinels and peripheral registers before
 * entering the rest of the program", and "Runtime initialization touches paged
 * XRAM, stack state, ports, timer/compare registers, ADC registers, and
 * interrupt controls."
 *
 * The integrity chapter adds the retained-state rule: "Startup at 5c00
 * initializes sentinel values and checks complementary 0x55/0xaa-style markers
 * in paged XRAM. Valid markers preserve/increment a retained byte; invalid
 * markers reinitialize it." SPECS is equally clear that "no EEPROM write was
 * recovered", so a warm start here means retained RAM, not stored data.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.runStartup = exports.MARKER_B = exports.MARKER_A = void 0;
const byte_math_ts_1 = require("../byte-math.js");
const memory_map_ts_1 = require("../memory-map.js");
const assumptions_ts_1 = require("../assumptions.js");
/** The complementary marker pair the specification describes. */
exports.MARKER_A = 0x55;
exports.MARKER_B = 0xaa;
const markersValid = (machine) => machine.xram.read(memory_map_ts_1.XRAM.startupMarkerA) === exports.MARKER_A &&
    machine.xram.read(memory_map_ts_1.XRAM.startupMarkerB) === exports.MARKER_B;
const runStartup = (machine, reason) => {
    const { sfr, idata, xram, interrupts, assumptions } = machine;
    // Stack state. The 8051 stack pointer starts above the register banks and
    // the bit-addressable window this model actually uses.
    sfr.write(0x81, 0x2f);
    // Ports to a defined state.
    machine.ports.reset();
    // Timer and compare registers.
    machine.timer2.reset();
    machine.timer1.reloadForPeriod((0, assumptions_ts_1.msToTicks)(assumptions, assumptions.timer1PeriodMs));
    sfr.write(memory_map_ts_1.SFR.CCEN, 0);
    // ADC registers.
    machine.adc.reset();
    // Interrupt controls: enabled individually, global enable last.
    interrupts.clearAll();
    for (const source of ['timer1', 'serial', 'timer2', 'ext3cc0', 'ext0']) {
        interrupts.setEnabled(source, true);
    }
    interrupts.globalEnable(true);
    // Retained-state check on the paged XRAM markers.
    const warmStart = markersValid(machine);
    if (warmStart) {
        xram.write(memory_map_ts_1.XRAM.retainedCounter, (0, byte_math_ts_1.u8)(xram.read(memory_map_ts_1.XRAM.retainedCounter) + 1));
    }
    else {
        xram.write(memory_map_ts_1.XRAM.startupMarkerA, exports.MARKER_A);
        xram.write(memory_map_ts_1.XRAM.startupMarkerB, exports.MARKER_B);
        xram.write(memory_map_ts_1.XRAM.retainedCounter, 0);
    }
    // Runtime sentinels: internal state starts from a known image every time.
    idata.clear();
    return { reason, warmStart, retainedCounter: xram.read(memory_map_ts_1.XRAM.retainedCounter) };
};
exports.runStartup = runStartup;
