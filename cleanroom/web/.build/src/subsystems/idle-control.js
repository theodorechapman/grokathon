"use strict";
/**
 * Idle detection, targets, and actuator control.
 *
 * Proven: three target-speed payload families — 57ef (P/N, A/C on or off),
 * 57fb (D/R with A/C on), 5805 (D/R with A/C off) — plus separate idle fuel
 * (49c1) and idle ignition (518c) families, target selection through the common
 * descriptor lookup, and timed/digital output control through port and compare
 * functions.
 *
 * Not proven: "It does not yet prove a named proportional/integral controller
 * or the unit of the target bytes. No PI gains are invented from generic
 * Motronic descriptions." The corrector below is therefore a plain bounded
 * integrator with model-local gains — deliberately not dressed up as the
 * firmware's controller. SPECS also flags that the first target table has "an
 * XDF axis-label count mismatch (four labels for six values), so label-to-cell
 * interpretation is not trusted"; that note travels with the result.
 *
 * The output goes to a model-local channel. BMW wiring assigns DME pin 29 to
 * idle-speed control, but "the MCU port or compare channel that reaches pin 29
 * is unresolved", so no pin is claimed.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.IdleControl = exports.IDLE_SLOTS = void 0;
const byte_math_ts_1 = require("../byte-math.js");
const selector_tables_ts_1 = require("../calibration/selector-tables.js");
exports.IDLE_SLOTS = {
    targetParkNeutral: 70,
    targetDriveAcOn: 71,
    targetDriveAcOff: 72,
};
/** Model-local corrector gains, byte domain. Not firmware values. */
const GAIN_PROPORTIONAL = 0.6;
const GAIN_INTEGRAL = 0.08;
const ACTUATOR_MIN = 0x10;
const ACTUATOR_MAX = 0xf0;
class IdleControl {
    integral = 0;
    actuator = 0x60;
    inputs = { parkNeutral: true, airConditioning: false };
    last = null;
    context;
    load;
    sync;
    constructor(context, load, sync) {
        this.context = context;
        this.load = load;
        this.sync = sync;
    }
    setInputs(inputs) {
        this.inputs = { ...this.inputs, ...inputs };
    }
    update() {
        const { lookup, assumptions } = this.context;
        const active = this.load.operatingMode() === 'idle';
        lookup.configure(selector_tables_ts_1.LOOKUP_CONFIGURATIONS.idleTargets);
        const { slot, variant } = this.selectTarget();
        const targetCount = lookup.evaluateSlot(slot).value;
        const targetRpm = targetCount * assumptions.rpmPerIdleTargetCount;
        if (!active) {
            this.integral = 0;
            this.last = { active, targetCount, targetRpm, actuatorCount: this.actuator, variant };
            return this.last;
        }
        const rpm = this.sync.speed()?.rpm ?? 0;
        const errorRpm = targetRpm - rpm;
        this.integral = (0, byte_math_ts_1.clamp)(this.integral + errorRpm * GAIN_INTEGRAL, -400, 400);
        const command = this.actuator + (errorRpm * GAIN_PROPORTIONAL + this.integral) / 32;
        this.actuator = (0, byte_math_ts_1.sat8)((0, byte_math_ts_1.clamp)(Math.round(command), ACTUATOR_MIN, ACTUATOR_MAX));
        this.context.machine.emit({
            kind: 'idle-actuator',
            channel: 'idle-actuator',
            detail: { command: this.actuator, targetRpm, rpm: Math.round(rpm) },
        });
        this.last = { active, targetCount, targetRpm, actuatorCount: this.actuator, variant };
        return this.last;
    }
    selectTarget() {
        if (this.inputs.parkNeutral) {
            return {
                slot: exports.IDLE_SLOTS.targetParkNeutral,
                variant: 'P/N (axis labels not trusted: four labels for six values)',
            };
        }
        return this.inputs.airConditioning
            ? { slot: exports.IDLE_SLOTS.targetDriveAcOn, variant: 'D/R with A/C on' }
            : { slot: exports.IDLE_SLOTS.targetDriveAcOff, variant: 'D/R with A/C off' };
    }
    latest() {
        return this.last;
    }
}
exports.IdleControl = IdleControl;
