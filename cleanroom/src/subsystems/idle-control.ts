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

import type { IdleResult } from '../types.ts';
import { clamp, sat8 } from '../byte-math.ts';
import { LOOKUP_CONFIGURATIONS } from '../calibration/selector-tables.ts';
import type { EcuContext } from '../context.ts';
import type { EngineLoad } from './engine-load.ts';
import type { CrankSync } from './crank-sync.ts';

export const IDLE_SLOTS = {
  targetParkNeutral: 70,
  targetDriveAcOn: 71,
  targetDriveAcOff: 72,
} as const;

export interface IdleInputs {
  /** True for P/N, false for D/R. SPECS: two A/C-related DME inputs and the
   *  transmission state exist; the bit-to-input mapping is not proven. */
  parkNeutral: boolean;
  airConditioning: boolean;
}

/** Model-local corrector gains, byte domain. Not firmware values. */
const GAIN_PROPORTIONAL = 0.6;
const GAIN_INTEGRAL = 0.08;
const ACTUATOR_MIN = 0x10;
const ACTUATOR_MAX = 0xf0;

export class IdleControl {
  private integral = 0;
  private actuator = 0x60;
  private inputs: IdleInputs = { parkNeutral: true, airConditioning: false };
  private last: IdleResult | null = null;

  private readonly context: EcuContext;
  private readonly load: EngineLoad;
  private readonly sync: CrankSync;

  constructor(context: EcuContext, load: EngineLoad, sync: CrankSync) {
    this.context = context;
    this.load = load;
    this.sync = sync;
  }

  setInputs(inputs: Partial<IdleInputs>): void {
    this.inputs = { ...this.inputs, ...inputs };
  }

  update(): IdleResult {
    const { lookup, assumptions } = this.context;
    const active = this.load.operatingMode() === 'idle';

    lookup.configure(LOOKUP_CONFIGURATIONS.idleTargets);
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
    this.integral = clamp(this.integral + errorRpm * GAIN_INTEGRAL, -400, 400);
    const command = this.actuator + (errorRpm * GAIN_PROPORTIONAL + this.integral) / 32;
    this.actuator = sat8(clamp(Math.round(command), ACTUATOR_MIN, ACTUATOR_MAX));

    this.context.machine.emit({
      kind: 'idle-actuator',
      channel: 'idle-actuator',
      detail: { command: this.actuator, targetRpm, rpm: Math.round(rpm) },
    });

    this.last = { active, targetCount, targetRpm, actuatorCount: this.actuator, variant };
    return this.last;
  }

  private selectTarget(): { slot: number; variant: string } {
    if (this.inputs.parkNeutral) {
      return {
        slot: IDLE_SLOTS.targetParkNeutral,
        variant: 'P/N (axis labels not trusted: four labels for six values)',
      };
    }
    return this.inputs.airConditioning
      ? { slot: IDLE_SLOTS.targetDriveAcOn, variant: 'D/R with A/C on' }
      : { slot: IDLE_SLOTS.targetDriveAcOff, variant: 'D/R with A/C off' };
  }

  latest(): IdleResult | null {
    return this.last;
  }
}
