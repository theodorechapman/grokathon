/**
 * Adaptive correction supervisor.
 *
 * SPECS gives this one in unusual detail: "CODE:677c loads XRAM correction
 * state and enters 678e through the configuration selector at 7b2f. 678e is a
 * bounded, debounced two-cell adaptive-correction supervisor:
 *   1. disable conditions neutralize XRAM 0001 and 0007 to 0x80;
 *   2. 6866 qualifies the operating window;
 *   3. 68aa detects centered-signal crossings;
 *   4. 68e2 classifies/debounces operating regions;
 *   5. 69b5 enforces stable-condition delay;
 *   6. 69e4 calculates a signed correction;
 *   7. 6a5f clamps it to calibrated limits;
 *   8. 6dec selects/blends one correction cell into the control path.
 * Status nibbles are stored in XRAM 002f; working/edge state occupies
 * 002c-002e; the composite correction reaches INTMEM:0057-0059."
 *
 * Each step below is one method, named for its address. What SPECS will not
 * say — and this file does not either — is which cell is the idle/additive one
 * and which is the part-load/multiplicative one: "The structure strongly
 * resembles additive/idle and multiplicative/part-load fuel adaptation, but
 * which cell is which is not binary-proven." They are `cellA` and `cellB`.
 */

import { NEUTRAL, clamp, highNibble, lowNibble, packNibbles, s8, sat8 } from '../byte-math.ts';
import { IDATA, XRAM } from '../memory-map.ts';
import { LOOKUP_CONFIGURATIONS } from '../calibration/selector-tables.ts';
import type { EcuContext } from '../context.ts';
import type { EngineLoad } from './engine-load.ts';

/** Region classification held in the low nibble of the status byte. */
export const REGION = { none: 0, cellA: 1, cellB: 2 } as const;

/** Model-local timings and limits; SPECS proves the steps, not the numbers. */
const STABLE_DELAY_PASSES = 6;
const DEBOUNCE_PASSES = 3;
const CORRECTION_LIMIT = 0x30;
const CORRECTION_STEP = 2;

export interface AdaptationSnapshot {
  enabled: boolean;
  region: number;
  qualified: boolean;
  stableFor: number;
  cellA: number;
  cellB: number;
  composite: number;
}

export class Adaptation {
  private stableFor = 0;
  private debounce = 0;
  private candidateRegion: number = REGION.none;
  private lastSignal = NEUTRAL;

  private readonly context: EcuContext;
  private readonly load: EngineLoad;
  /** Disable conditions, supplied by fault handling and the operating state. */
  private readonly disabled: () => boolean;

  constructor(context: EcuContext, load: EngineLoad, disabled: () => boolean) {
    this.context = context;
    this.load = load;
    this.disabled = disabled;
  }

  initialise(): void {
    const { xram, idata } = this.context.machine;
    xram.write(XRAM.adaptationCellA, NEUTRAL);
    xram.write(XRAM.adaptationCellB, NEUTRAL);
    xram.write(XRAM.adaptationWorking, 0);
    xram.write(XRAM.adaptationEdge, 0);
    xram.write(XRAM.adaptationRegion, 0);
    xram.write(XRAM.adaptationStatus, 0);
    idata.write(IDATA.adaptationCompositeA, NEUTRAL);
    idata.write(IDATA.adaptationCompositeB, NEUTRAL);
    idata.write(IDATA.adaptationCompositeC, NEUTRAL);
  }

  /** CODE:677c — load correction state and enter through the 7b2f selector. */
  service(): AdaptationSnapshot {
    this.context.lookup.configure(LOOKUP_CONFIGURATIONS.adaptation);
    return this.supervise();
  }

  /** CODE:678e — the supervisor proper. */
  private supervise(): AdaptationSnapshot {
    if (this.disabled()) {
      this.neutralise();
      return this.snapshot(false, false);
    }

    const qualified = this.qualifyWindow();
    const crossed = this.detectCrossing();
    const region = this.classifyRegion(qualified);
    const stable = this.enforceStableDelay(qualified && region !== REGION.none);

    if (stable && crossed) {
      const correction = this.calculateCorrection(region);
      this.applyClamped(region, correction);
    }
    this.blendIntoControlPath();
    return this.snapshot(true, qualified);
  }

  /** Step 1 — disable conditions neutralise both cells to 0x80. */
  private neutralise(): void {
    const { xram } = this.context.machine;
    xram.write(XRAM.adaptationCellA, NEUTRAL);
    xram.write(XRAM.adaptationCellB, NEUTRAL);
    this.stableFor = 0;
    this.debounce = 0;
    this.setStatus(REGION.none, 0);
    this.blendIntoControlPath();
  }

  /** Step 2, CODE:6866 — is the operating window valid. */
  private qualifyWindow(): boolean {
    const mode = this.load.operatingMode();
    return mode === 'idle' || mode === 'part-load';
  }

  /** Step 3, CODE:68aa — centred-signal crossing detection. The centred signal
   *  is the hysteretic channel at INTMEM:0039, whose identity SPECS leaves
   *  open. Edge state is kept at XRAM:002d. */
  private detectCrossing(): boolean {
    const { idata, xram } = this.context.machine;
    const signal = idata.read(IDATA.hystereticChannel);
    const crossed =
      (this.lastSignal < NEUTRAL && signal >= NEUTRAL) ||
      (this.lastSignal >= NEUTRAL && signal < NEUTRAL);
    this.lastSignal = signal;
    if (crossed) xram.write(XRAM.adaptationEdge, sat8(xram.read(XRAM.adaptationEdge) + 1));
    return crossed;
  }

  /** Step 4, CODE:68e2 — classify and debounce the operating region. */
  private classifyRegion(qualified: boolean): number {
    const { xram } = this.context.machine;
    const region = !qualified
      ? REGION.none
      : this.load.operatingMode() === 'idle'
        ? REGION.cellA
        : REGION.cellB;

    if (region !== this.candidateRegion) {
      this.candidateRegion = region;
      this.debounce = 0;
      return REGION.none;
    }
    this.debounce = Math.min(DEBOUNCE_PASSES, this.debounce + 1);
    if (this.debounce < DEBOUNCE_PASSES) return REGION.none;
    xram.write(XRAM.adaptationRegion, region);
    return region;
  }

  /** Step 5, CODE:69b5 — stable-condition delay. */
  private enforceStableDelay(conditionsHold: boolean): boolean {
    this.stableFor = conditionsHold ? this.stableFor + 1 : 0;
    this.context.machine.xram.write(XRAM.adaptationWorking, sat8(this.stableFor));
    return this.stableFor >= STABLE_DELAY_PASSES;
  }

  /** Step 6, CODE:69e4 — signed correction from the centred signal. */
  private calculateCorrection(region: number): number {
    if (region === REGION.none) return 0;
    const signal = this.context.machine.idata.read(IDATA.hystereticChannel);
    return signal >= NEUTRAL ? CORRECTION_STEP : -CORRECTION_STEP;
  }

  /** Step 7, CODE:6a5f — clamp to the calibrated limits. */
  private applyClamped(region: number, correction: number): void {
    const { xram } = this.context.machine;
    const address = region === REGION.cellA ? XRAM.adaptationCellA : XRAM.adaptationCellB;
    const next = clamp(
      xram.read(address) + correction,
      NEUTRAL - CORRECTION_LIMIT,
      NEUTRAL + CORRECTION_LIMIT,
    );
    xram.write(address, next);
    this.setStatus(region, Math.abs(s8(next - NEUTRAL)) > 0 ? 1 : 0);
  }

  /** Step 8, CODE:6dec — select/blend one cell into the control path, landing
   *  at INTMEM:0057-0059. */
  private blendIntoControlPath(): void {
    const { xram, idata } = this.context.machine;
    const cellA = xram.read(XRAM.adaptationCellA);
    const cellB = xram.read(XRAM.adaptationCellB);
    const selected = xram.read(XRAM.adaptationRegion) === REGION.cellA ? cellA : cellB;
    idata.write(IDATA.adaptationCompositeA, cellA);
    idata.write(IDATA.adaptationCompositeB, cellB);
    idata.write(IDATA.adaptationCompositeC, selected);
  }

  /** Status nibbles at XRAM:002f. */
  private setStatus(region: number, learned: number): void {
    this.context.machine.xram.write(XRAM.adaptationStatus, packNibbles(learned, region));
  }

  status(): { region: number; learned: number } {
    const byte = this.context.machine.xram.read(XRAM.adaptationStatus);
    return { region: lowNibble(byte), learned: highNibble(byte) };
  }

  private snapshot(enabled: boolean, qualified: boolean): AdaptationSnapshot {
    const { xram, idata } = this.context.machine;
    return {
      enabled,
      qualified,
      region: xram.read(XRAM.adaptationRegion),
      stableFor: this.stableFor,
      cellA: xram.read(XRAM.adaptationCellA),
      cellB: xram.read(XRAM.adaptationCellB),
      composite: idata.read(IDATA.adaptationCompositeC),
    };
  }
}
