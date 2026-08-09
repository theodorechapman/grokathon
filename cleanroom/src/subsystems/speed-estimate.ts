/**
 * Speed from capture periods.
 *
 * SPECS draws a hard line here: "The firmware proves that RPM is derived from
 * differences between captured timer values, but the complete consumer chain
 * and oscillator frequency have not established a defensible engineering-unit
 * equation. The safe form is `speed ∝ timer_clock / capture_period`. The
 * proportionality constant depends on timer prescaling and the number of crank
 * events per revolution."
 *
 * So this module computes the proven quantity — the proportionality — and only
 * converts to RPM when handed the two assumed constants. `proportional` is
 * always valid; `rpm` is only as good as `Assumptions`.
 */

import type { Assumptions } from '../assumptions.ts';
import { timerClockHz } from '../assumptions.ts';

export interface SpeedEstimate {
  /** `timer_clock / capture_period`, in captures per second. The form the
   *  specification is willing to state. */
  proportional: number;
  /** Engineering view. Rests on `crankEventsPerRevolution` and the oscillator. */
  rpm: number;
  periodTicks: number;
}

export const estimateSpeed = (
  assumptions: Assumptions,
  periodTicks: number,
): SpeedEstimate | null => {
  if (periodTicks <= 0) return null;
  const proportional = timerClockHz(assumptions) / periodTicks;
  return {
    proportional,
    rpm: (proportional * 60) / assumptions.crankEventsPerRevolution,
    periodTicks,
  };
};

/** Inverse, for a bench that wants to drive the model at a given speed. */
export const periodForRpm = (assumptions: Assumptions, rpm: number): number => {
  if (rpm <= 0) return 0;
  const eventsPerSecond = (rpm * assumptions.crankEventsPerRevolution) / 60;
  return Math.max(1, Math.round(timerClockHz(assumptions) / eventsPerSecond));
};
