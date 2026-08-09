"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.periodForRpm = exports.estimateSpeed = void 0;
const assumptions_ts_1 = require("../assumptions.js");
const estimateSpeed = (assumptions, periodTicks) => {
    if (periodTicks <= 0)
        return null;
    const proportional = (0, assumptions_ts_1.timerClockHz)(assumptions) / periodTicks;
    return {
        proportional,
        rpm: (proportional * 60) / assumptions.crankEventsPerRevolution,
        periodTicks,
    };
};
exports.estimateSpeed = estimateSpeed;
/** Inverse, for a bench that wants to drive the model at a given speed. */
const periodForRpm = (assumptions, rpm) => {
    if (rpm <= 0)
        return 0;
    const eventsPerSecond = (rpm * assumptions.crankEventsPerRevolution) / 60;
    return Math.max(1, Math.round((0, assumptions_ts_1.timerClockHz)(assumptions) / eventsPerSecond));
};
exports.periodForRpm = periodForRpm;
