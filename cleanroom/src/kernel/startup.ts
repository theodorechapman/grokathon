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

import type { RestartReason } from '../context.ts';
import { u8 } from '../byte-math.ts';
import { SFR, XRAM } from '../memory-map.ts';
import { msToTicks } from '../assumptions.ts';
import type { Machine } from '../hardware/machine.ts';

/** The complementary marker pair the specification describes. */
export const MARKER_A = 0x55;
export const MARKER_B = 0xaa;

export interface StartupOutcome {
  reason: RestartReason;
  /** True when the retained markers were intact. */
  warmStart: boolean;
  retainedCounter: number;
}

const markersValid = (machine: Machine): boolean =>
  machine.xram.read(XRAM.startupMarkerA) === MARKER_A &&
  machine.xram.read(XRAM.startupMarkerB) === MARKER_B;

export const runStartup = (machine: Machine, reason: RestartReason): StartupOutcome => {
  const { sfr, idata, xram, interrupts, assumptions } = machine;

  // Stack state. The 8051 stack pointer starts above the register banks and
  // the bit-addressable window this model actually uses.
  sfr.write(0x81, 0x2f);

  // Ports to a defined state.
  machine.ports.reset();

  // Timer and compare registers.
  machine.timer2.reset();
  machine.timer1.reloadForPeriod(msToTicks(assumptions, assumptions.timer1PeriodMs));
  sfr.write(SFR.CCEN, 0);

  // ADC registers.
  machine.adc.reset();

  // Interrupt controls: enabled individually, global enable last.
  interrupts.clearAll();
  for (const source of ['timer1', 'serial', 'timer2', 'ext3cc0', 'ext0'] as const) {
    interrupts.setEnabled(source, true);
  }
  interrupts.globalEnable(true);

  // Retained-state check on the paged XRAM markers.
  const warmStart = markersValid(machine);
  if (warmStart) {
    xram.write(XRAM.retainedCounter, u8(xram.read(XRAM.retainedCounter) + 1));
  } else {
    xram.write(XRAM.startupMarkerA, MARKER_A);
    xram.write(XRAM.startupMarkerB, MARKER_B);
    xram.write(XRAM.retainedCounter, 0);
  }

  // Runtime sentinels: internal state starts from a known image every time.
  idata.clear();

  return { reason, warmStart, retainedCounter: xram.read(XRAM.retainedCounter) };
};
