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

import type { FuelResult } from '../types.ts';
import { NEUTRAL, high8, sat8 } from '../byte-math.ts';
import { XRAM } from '../memory-map.ts';
import { LOOKUP_CONFIGURATIONS } from '../calibration/selector-tables.ts';
import type { EcuContext } from '../context.ts';
import type { EngineLoad } from './engine-load.ts';

/** Master slots the specification names for fuel. */
export const FUEL_SLOTS = {
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
} as const;

export interface FuelInhibit {
  cut: boolean;
  reason: string | null;
}

export class FuelControl {
  private lastLoad = 0;
  private last: FuelResult | null = null;

  private readonly context: EcuContext;
  private readonly load: EngineLoad;
  /** Supplied by the limiter and overrun latch. */
  private readonly inhibit: () => FuelInhibit;

  constructor(context: EcuContext, load: EngineLoad, inhibit: () => FuelInhibit) {
    this.context = context;
    this.load = load;
    this.inhibit = inhibit;
  }

  update(): FuelResult {
    const { lookup } = this.context;
    const mode = this.load.operatingMode();

    lookup.configure(
      mode === 'wide-open-throttle'
        ? LOOKUP_CONFIGURATIONS.fuelWideOpenThrottle
        : mode === 'idle'
          ? LOOKUP_CONFIGURATIONS.idle
          : LOOKUP_CONFIGURATIONS.fuelPartLoad,
    );

    const base = this.selectBase(mode);
    const transient = this.updateTransientEnrichment();
    const correction = this.assembleCorrection(transient);
    const lag = lookup.evaluateSlot(FUEL_SLOTS.injectorLag).value;

    if (mode === 'wide-open-throttle') this.evaluateWotVariant();

    const inhibit = this.inhibit();
    const pulseCount = inhibit.cut ? 0 : sat8(high8(base, correction) * 2);
    const result: FuelResult = {
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
    if (!inhibit.cut) this.dispatch(result);
    return result;
  }

  /** Base payload for the active mode. */
  private selectBase(mode: string): number {
    const { lookup } = this.context;
    if (mode === 'idle') return lookup.evaluateSlot(FUEL_SLOTS.idleFuel).value;
    if (mode === 'wide-open-throttle') return lookup.evaluateSlot(FUEL_SLOTS.wotVariantA).value;
    const base = lookup.evaluateSlot(FUEL_SLOTS.partLoadBase);
    return base.available ? base.value : NEUTRAL;
  }

  /** CODE:3585 — `EXTMEM:006e = high8(calibration_a * calibration_b)`, driven
   *  by the change in load since the last pass. */
  private updateTransientEnrichment(): number {
    const { xram } = this.context.machine;
    const { lookup } = this.context;
    const load = this.load.comparisonInputs().normalizedLoad;
    const delta = sat8(Math.abs(load - this.lastLoad) * 8);
    this.lastLoad = load;

    const calibrationA = lookup.evaluateSlot(FUEL_SLOTS.accelerationEnrichment).value;
    const value = high8(calibrationA, delta);
    xram.write(XRAM.transientEnrichment, value);
    return value;
  }

  /** CODE:3800 — assemble lookup results with fixed-point multiplication. */
  private assembleCorrection(transient: number): number {
    const { lookup } = this.context;
    const terms = [
      lookup.evaluateSlot(FUEL_SLOTS.temperatureEnrichmentA).value,
      lookup.evaluateSlot(FUEL_SLOTS.temperatureEnrichmentB).value,
      lookup.evaluateSlot(FUEL_SLOTS.temperatureVoltageTrim).value,
    ].filter((value) => value !== 0xff);

    let composite = NEUTRAL;
    for (const term of terms) composite = sat8(high8(composite, term) * 2);
    return sat8(composite + (transient >> 2));
  }

  /** CODE:3a83 — configuration-dependent WOT variant into XRAM 0069-006a. */
  private evaluateWotVariant(): void {
    const { xram } = this.context.machine;
    const { lookup } = this.context;
    const a = lookup.evaluateSlot(FUEL_SLOTS.wotVariantA).value;
    const b = lookup.evaluateSlot(FUEL_SLOTS.wotVariantB).value;
    xram.write(XRAM.wotVariantHigh, a);
    xram.write(XRAM.wotVariantLow, b);
  }

  /** `6b60 -> 2178` — dispatch the composite to the scheduled outputs. Two
   *  banks, deliberately unmapped to pins. */
  private dispatch(result: FuelResult): void {
    const ticks = Math.round(
      (result.pulseWidthMs * this.context.machine.assumptions.oscillatorHz) /
        (this.context.machine.assumptions.cyclesPerOscillator * 1000),
    );
    for (const bank of ['a', 'b']) {
      this.context.machine.emit({
        kind: 'injector',
        channel: `injector-bank-${bank}`,
        durationTicks: ticks,
        detail: { pulseCount: result.pulseCount, base: result.base, correction: result.correction },
      });
    }
  }

  private toMilliseconds(pulseCount: number, lag: number): number {
    const { injectorMsPerFuelCount, injectorLagMsPerCount } = this.context.assumptions;
    return pulseCount * injectorMsPerFuelCount + lag * injectorLagMsPerCount;
  }

  latest(): FuelResult | null {
    return this.last;
  }
}
