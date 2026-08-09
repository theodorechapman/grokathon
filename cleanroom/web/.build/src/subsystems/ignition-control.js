"use strict";
/**
 * Ignition advance, dwell, and event scheduling.
 *
 * Proven: the lookup service supplies interpolated bytes from the selected
 * operating variant; integer consumers combine them with runtime state; the
 * compare/capture cluster "reads captured Timer-2 state and writes CCL/CCH and
 * CRCL/CRCH schedules", with CODE:8000 as a direct compare-register service.
 *
 * Not proven, and therefore assumption here: the signed angle representation
 * ("XDF 'real BTDC' conversion text is not treated as a firmware equation"),
 * the dwell axes ("the binary evidence required to assign its two direct-data
 * axes to battery voltage and RPM is still incomplete"), and above all the
 * cylinder mapping — "the firmware proves multiple scheduled outputs but does
 * not expose the PCB mapping from CC channels/port bits to cylinders. Cylinder
 * order is therefore not assigned to individual registers."
 *
 * So this schedules events on compare channels 2 and 3, the two the
 * specification observes in use, and names them by channel, not by cylinder.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.IgnitionControl = exports.SCHEDULED_COMPARE_CHANNELS = exports.IGNITION_SLOTS = void 0;
const selector_tables_ts_1 = require("../calibration/selector-tables.js");
exports.IGNITION_SLOTS = {
    dwell: 50,
    mainAdvance: 51,
    idleAdvance: 52,
};
/** SPECS: "no direct CC1 use is present"; channels 2 and 3 are the observed
 *  scheduling pair, driven together with P1.2/P1.3 by the periodic service. */
exports.SCHEDULED_COMPARE_CHANNELS = [2, 3];
class IgnitionControl {
    last = null;
    dwellTruncated = false;
    context;
    load;
    inhibit;
    constructor(context, load, inhibit) {
        this.context = context;
        this.load = load;
        this.inhibit = inhibit;
    }
    update() {
        const { lookup, assumptions } = this.context;
        const idle = this.load.operatingMode() === 'idle';
        lookup.configure(idle ? selector_tables_ts_1.LOOKUP_CONFIGURATIONS.idle : selector_tables_ts_1.LOOKUP_CONFIGURATIONS.ignition);
        const advanceCount = lookup.evaluateSlot(idle ? exports.IGNITION_SLOTS.idleAdvance : exports.IGNITION_SLOTS.mainAdvance).value;
        const dwellCount = lookup.evaluateSlot(exports.IGNITION_SLOTS.dwell).value;
        const inhibited = this.inhibit();
        const result = {
            advanceCount,
            dwellCount,
            advanceDegBtdc: advanceCount * assumptions.ignitionDegreesPerCount + assumptions.ignitionDegreeOffset,
            dwellMs: dwellCount * assumptions.dwellMsPerCount,
            suppressed: inhibited.suppress,
            suppressReason: inhibited.reason,
        };
        this.last = result;
        return result;
    }
    /**
     * Convert the current advance and dwell into timer-domain deadlines and arm
     * the compare channels. Called from the capture path, which is what re-opens
     * the scheduling window each segment.
     */
    schedule(segmentPeriod) {
        const result = this.last ?? this.update();
        if (result.suppressed)
            return;
        const { timer2, assumptions } = this.context.machine;
        const now = timer2.value();
        const dwellTicks = Math.max(1, Math.round((result.dwellMs * assumptions.oscillatorHz) / (assumptions.cyclesPerOscillator * 1000)));
        // Advance measured backwards from the next segment boundary, in the
        // segment's own time domain.
        const advanceFraction = Math.min(0.9, Math.max(0, result.advanceDegBtdc / (360 / assumptions.crankEventsPerRevolution) / 8));
        const fireDelay = Math.round(segmentPeriod * (1 - advanceFraction));
        const fireAt = (now + fireDelay) & 0xffff;
        /**
         * Dwell longer than the segment cannot be scheduled backwards from the
         * fire point: subtracting it wraps the charge past the previous segment,
         * where the next capture re-arms the channel before it ever fires, and the
         * coil is commanded to spark without having charged.
         *
         * Charging as early as the segment allows is what a real controller does,
         * and it keeps every fire paired with a charge. The truncation is reported
         * rather than hidden — it means the calibrated dwell is not achievable at
         * this speed, which is a genuine signal about the dwell and tooth-count
         * assumptions rather than something to paper over.
         */
        // A compare armed at exactly the current count is one full 65536-tick wrap
        // away, not immediate, so the earliest schedulable charge is now + 1.
        const dwellFits = dwellTicks < fireDelay;
        const chargeAt = dwellFits ? (fireAt - dwellTicks) & 0xffff : (now + 1) & 0xffff;
        const effectiveDwell = dwellFits ? dwellTicks : Math.max(1, fireDelay - 1);
        this.dwellTruncated = !dwellFits;
        const [chargeChannel, fireChannel] = exports.SCHEDULED_COMPARE_CHANNELS;
        timer2.arm(chargeChannel, chargeAt, 'coil-charge', () => {
            this.context.machine.emit({
                kind: 'coil-charge',
                channel: `compare-${chargeChannel}`,
                detail: {
                    dwellCount: result.dwellCount,
                    dwellMs: result.dwellMs,
                    effectiveDwellTicks: effectiveDwell,
                    truncated: !dwellFits,
                },
            });
            this.context.machine.ports.setP1(chargeChannel, true);
        });
        timer2.arm(fireChannel, fireAt, 'coil-fire', () => {
            this.context.machine.emit({
                kind: 'coil-fire',
                channel: `compare-${fireChannel}`,
                detail: {
                    advanceCount: result.advanceCount,
                    advanceDegBtdc: result.advanceDegBtdc,
                },
            });
            this.context.machine.ports.setP1(fireChannel, false);
        });
    }
    latest() {
        return this.last;
    }
    /** True when the calibrated dwell did not fit inside the last segment. */
    wasDwellTruncated() {
        return this.dwellTruncated;
    }
}
exports.IgnitionControl = IgnitionControl;
