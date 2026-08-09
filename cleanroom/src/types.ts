/**
 * Shared types. One definition per concept; no module redeclares these.
 */

export type Byte = number;
export type Word = number;
/** Timer-2 input clock ticks. The only time base in the model. */
export type Ticks = number;

/** Interrupt sources of the SAB80C515 as the specification enumerates them. */
export type InterruptSource =
  | 'ext0'
  | 'timer0'
  | 'ext1'
  | 'timer1'
  | 'serial'
  | 'timer2'
  | 'adc'
  | 'ext2'
  | 'ext3cc0'
  | 'ext4'
  | 'ext5'
  | 'ext6';

/** How firmly a mapping is established. SPECS grades every claim; so does this
 *  model, and the grade travels with the value. */
export type Confidence = 'high' | 'medium' | 'low' | 'unknown';

export interface OutputEvent {
  at: Ticks;
  kind:
    | 'injector'
    | 'coil-charge'
    | 'coil-fire'
    | 'idle-actuator'
    | 'actuator-test'
    | 'restart'
    | 'fault';
  /** Logical channel. SPECS: the firmware-to-PCB channel mapping is not
   *  recovered, so these are model-local names, never pin assignments. */
  channel: string;
  durationTicks?: number;
  detail?: Record<string, number | string | boolean>;
}

/** A value whose engineering unit rests on an assumption. */
export interface Scaled {
  raw: Byte;
  value: number;
  unit: string;
  confidence: Confidence;
}

export interface CaptureEvent {
  /** 24-bit `epoch:CRCH:CRCL` extended capture time. */
  timestamp: number;
  epoch: Byte;
  high: Byte;
  low: Byte;
  /** True when the rollover correction at CODE:2462 fired. */
  rolloverCorrected: boolean;
}

export interface FaultRecord {
  index: number;
  identifier: Byte;
  status: Byte;
  snapshotA: Byte;
  snapshotB: Byte;
  age: Byte;
}

export interface FuelResult {
  /** Selected base payload byte before corrections. */
  base: Byte;
  /** Composite correction, byte domain. */
  correction: Byte;
  /** Injector lag contribution from master slot 8 / payload 488b. */
  lag: Byte;
  /** Final byte-domain pulse quantity written to the schedule. */
  pulseCount: Byte;
  /** Engineering view; rests on assumed injector scaling. */
  pulseWidthMs: number;
  /** XDF AFR view of the base byte. Not an independent firmware equation. */
  afrView: number;
  cut: boolean;
  cutReason: string | null;
}

export interface IgnitionResult {
  advanceCount: Byte;
  dwellCount: Byte;
  advanceDegBtdc: number;
  dwellMs: number;
  suppressed: boolean;
  suppressReason: string | null;
}

export interface IdleResult {
  active: boolean;
  targetCount: Byte;
  targetRpm: number;
  /** Actuator command, byte domain. SPECS: duty equation not traced. */
  actuatorCount: Byte;
  variant: string;
}

export interface LimiterState {
  cutStageActive: boolean;
  cutStageComplement: boolean;
  countdown: Byte;
  overrunActive: boolean;
  overrunTimer: Byte;
  limitRpm: number;
  resumeRpm: number;
}
