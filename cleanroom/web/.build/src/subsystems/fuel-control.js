"use strict";
/**
 * Fuel target, corrections, and scheduling.
 *
 * Proven operations, in the specification's own order:
 *   1. operating state selects a lookup configuration (7930-7c0c);
 *   2. a logical index selects a descriptor through 0400;
 *   3. 046a/0493/04a2 interpolate byte-domain calibration values;
 *   4. external control functions combine those results with live state using
 *      bounded integer arithmetic.
 * CODE:3585 updates transient enrichment, including
 * `EXTMEM:006e = high8(calibration_a * calibration_b)`. CODE:3800 assembles
 * many lookup results with fixed-point multiplication and dispatches the
 * composite correction through `6b60 -> 2178`. CODE:3a83 evaluates a
 * configuration-dependent WOT variant into page-relative XRAM 0069-006a.
 *
 * What is *not* proven, and is therefore assumption in this file: the base
 * pulse-width equation, the final pulse-width storage location, the order of
 * corrections, and which output channel is which injector bank. SPECS: "BMW
 * wiring identifies two injector-bank outputs at DME pins 3 and 32. The
 * firmware-to-PCB channel mapping is unavailable, so no CCn register is
 * declared to be a specific injector bank." The banks below are named `a` and
 * `b`, and that is all they claim to be.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FuelControl = exports.FUEL_SLOTS = void 0;
const byte_math_ts_1 = require("../byte-math.js");
const memory_map_ts_1 = require("../memory-map.js");
const selector_tables_ts_1 = require("../calibration/selector-tables.js");
/** Master slots the specification names for fuel. */
exports.FUEL_SLOTS = {
    injectorLag: 8,
    temperatureVoltageTrim: 16,
    temperatureEnrichmentA: 18,
    accelerationEnrichment: 19,
    temperatureEnrichmentB: 20,
    idleFuel: 25,
    wotVariantA: 26,
    wotVariantB: 32,
    /**
     * A part-throttle family, used as the part-load base.
     *
     * SPECS: "Six XDF part-throttle maps have no consumers in recovered selector
     * configurations; that means unobserved, not dead." No selector table in this
     * model points at them either — that finding is preserved — but a controller
     * needs a part-load base from somewhere, so this one edge reaches the family
     * directly by slot. It is the model's choice, not a recovered call.
     */
    partLoadBase: 40,
};
class FuelControl {
    lastLoad = 0;
    last = null;
    context;
    load;
    /** Supplied by the limiter and overrun latch. */
    inhibit;
    constructor(context, load, inhibit) {
        this.context = context;
        this.load = load;
        this.inhibit = inhibit;
    }
    update() {
        const { lookup } = this.context;
        const mode = this.load.operatingMode();
        lookup.configure(mode === 'wide-open-throttle'
            ? selector_tables_ts_1.LOOKUP_CONFIGURATIONS.fuelWideOpenThrottle
            : mode === 'idle'
                ? selector_tables_ts_1.LOOKUP_CONFIGURATIONS.idle
                : selector_tables_ts_1.LOOKUP_CONFIGURATIONS.fuelPartLoad);
        const base = this.selectBase(mode);
        const transient = this.updateTransientEnrichment();
        const correction = this.assembleCorrection(transient);
        const lag = lookup.evaluateSlot(exports.FUEL_SLOTS.injectorLag).value;
        if (mode === 'wide-open-throttle')
            this.evaluateWotVariant();
        const inhibit = this.inhibit();
        const pulseCount = inhibit.cut ? 0 : (0, byte_math_ts_1.sat8)((0, byte_math_ts_1.high8)(base, correction) * 2);
        const result = {
            base,
            correction,
            lag,
            pulseCount,
            pulseWidthMs: this.toMilliseconds(pulseCount, lag),
            afrView: base === 0 ? 0 : this.context.assumptions.afrNumerator / base,
            cut: inhibit.cut,
            cutReason: inhibit.reason,
        };
        this.last = result;
        if (!inhibit.cut)
            this.dispatch(result);
        return result;
    }
    /** Base payload for the active mode. */
    selectBase(mode) {
        const { lookup } = this.context;
        if (mode === 'idle')
            return lookup.evaluateSlot(exports.FUEL_SLOTS.idleFuel).value;
        if (mode === 'wide-open-throttle')
            return lookup.evaluateSlot(exports.FUEL_SLOTS.wotVariantA).value;
        const base = lookup.evaluateSlot(exports.FUEL_SLOTS.partLoadBase);
        return base.available ? base.value : byte_math_ts_1.NEUTRAL;
    }
    /** CODE:3585 — `EXTMEM:006e = high8(calibration_a * calibration_b)`, driven
     *  by the change in load since the last pass. */
    updateTransientEnrichment() {
        const { xram } = this.context.machine;
        const { lookup } = this.context;
        const load = this.load.comparisonInputs().normalizedLoad;
        const delta = (0, byte_math_ts_1.sat8)(Math.abs(load - this.lastLoad) * 8);
        this.lastLoad = load;
        const calibrationA = lookup.evaluateSlot(exports.FUEL_SLOTS.accelerationEnrichment).value;
        const value = (0, byte_math_ts_1.high8)(calibrationA, delta);
        xram.write(memory_map_ts_1.XRAM.transientEnrichment, value);
        return value;
    }
    /** CODE:3800 — assemble lookup results with fixed-point multiplication. */
    assembleCorrection(transient) {
        const { lookup } = this.context;
        const terms = [
            lookup.evaluateSlot(exports.FUEL_SLOTS.temperatureEnrichmentA).value,
            lookup.evaluateSlot(exports.FUEL_SLOTS.temperatureEnrichmentB).value,
            lookup.evaluateSlot(exports.FUEL_SLOTS.temperatureVoltageTrim).value,
        ].filter((value) => value !== 0xff);
        let composite = byte_math_ts_1.NEUTRAL;
        for (const term of terms)
            composite = (0, byte_math_ts_1.sat8)((0, byte_math_ts_1.high8)(composite, term) * 2);
        return (0, byte_math_ts_1.sat8)(composite + (transient >> 2));
    }
    /** CODE:3a83 — configuration-dependent WOT variant into XRAM 0069-006a. */
    evaluateWotVariant() {
        const { xram } = this.context.machine;
        const { lookup } = this.context;
        const a = lookup.evaluateSlot(exports.FUEL_SLOTS.wotVariantA).value;
        const b = lookup.evaluateSlot(exports.FUEL_SLOTS.wotVariantB).value;
        xram.write(memory_map_ts_1.XRAM.wotVariantHigh, a);
        xram.write(memory_map_ts_1.XRAM.wotVariantLow, b);
    }
    /** `6b60 -> 2178` — dispatch the composite to the scheduled outputs. Two
     *  banks, deliberately unmapped to pins. */
    dispatch(result) {
        const ticks = Math.round((result.pulseWidthMs * this.context.machine.assumptions.oscillatorHz) /
            (this.context.machine.assumptions.cyclesPerOscillator * 1000));
        for (const bank of ['a', 'b']) {
            this.context.machine.emit({
                kind: 'injector',
                channel: `injector-bank-${bank}`,
                durationTicks: ticks,
                detail: { pulseCount: result.pulseCount, base: result.base, correction: result.correction },
            });
        }
    }
    toMilliseconds(pulseCount, lag) {
        const { injectorMsPerFuelCount, injectorLagMsPerCount } = this.context.assumptions;
        return pulseCount * injectorMsPerFuelCount + lag * injectorLagMsPerCount;
    }
    latest() {
        return this.last;
    }
}
exports.FuelControl = FuelControl;
