/**
 * Four-stroke cycle math for the cutaway inline-four.
 *
 * Flat-plane crank (throws 0-180-180-0) firing 1-3-4-2. `cylinderCycle` maps
 * a 0..4π engine-cycle angle to everything the paint code needs per cylinder:
 * slider-crank positions, valve lifts, and how bright the combustion and
 * spark events should be. Only one cylinder is ever on its power stroke.
 */

export interface CylinderState {
  /** Crank-throw angle for this cylinder, radians. */
  angle: number;
  /** Crankpin offset from the bore centreline. */
  pinX: number;
  pinY: number;
  /** Wrist-pin height on the bore centreline (negative is up). */
  pistonY: number;
  /** Position in this cylinder's own 0..4π cycle; 0 is firing TDC. */
  phase: number;
  intakeLift: number;
  exhaustLift: number;
  /** 0..1 flame brightness, non-zero only on the power stroke. */
  combustion: number;
  /** 0..1 spark-kernel brightness just before firing TDC. */
  spark: number;
}

export const THROW_R = 34;
export const ROD_L = 118;
export const BORE = 44;
export const SPACING = 72;
export const BASE_X = -1.5 * SPACING;
/** Top of the block; piston crowns just reach it at TDC. */
export const DECK_Y = -184;

const TAU = Math.PI * 2;
const CYCLE = 2 * TAU;
const THROWS = [0, Math.PI, Math.PI, 0] as const;
/** Cycle angle of each cylinder's firing TDC; an even 180° apart in 1-3-4-2. */
const FIRING = [1.5 * Math.PI, 0.5 * Math.PI, 2.5 * Math.PI, 3.5 * Math.PI] as const;
/** How long the spark kernel stays visible before TDC, in crank radians. */
const SPARK_LEAD = 0.5;

const halfSine = (t: number): number => Math.sin(Math.max(0, Math.min(1, t)) * Math.PI);

export const cylinderCycle = (cycleAngle: number, index: number): CylinderState => {
  const angle = (cycleAngle + THROWS[index]) % TAU;
  const pinX = Math.cos(angle) * THROW_R;
  const pinY = Math.sin(angle) * THROW_R;
  const pistonY = pinY - Math.sqrt(ROD_L * ROD_L - pinX * pinX);
  const phase = (((cycleAngle - FIRING[index]) % CYCLE) + CYCLE) % CYCLE;
  const stroke = phase / Math.PI;
  return {
    angle,
    pinX,
    pinY,
    pistonY,
    phase,
    combustion: stroke < 1 ? (1 - stroke) ** 1.6 : 0,
    exhaustLift: stroke >= 1 && stroke < 2 ? halfSine(stroke - 1) : 0,
    intakeLift: stroke >= 2 && stroke < 3 ? halfSine(stroke - 2) : 0,
    spark: phase > CYCLE - SPARK_LEAD ? (phase - (CYCLE - SPARK_LEAD)) / SPARK_LEAD : 0,
  };
};

/** 0..1 blowdown pressure at the exhaust header, summed over cylinders. */
export const exhaustPulse = (cycleAngle: number): number => {
  let total = 0;
  for (let index = 0; index < 4; index += 1) {
    const stroke = cylinderCycle(cycleAngle, index).phase / Math.PI;
    if (stroke >= 1 && stroke < 1.7) total += 1 - (stroke - 1) / 0.7;
  }
  return Math.min(1, total);
};
