import type { Assumptions } from '../../src/assumptions.ts';
import type { DisclosureEntry } from '../../src/disclosure.ts';
import type { FuelResult, IdleResult, IgnitionResult } from '../../src/types.ts';

export type TraceLane =
  | 'capture'
  | 'ignition-charge'
  | 'p15-ignition'
  | 'cc2-cc3-schedule'
  | 'idle-actuator';

export interface TracePoint {
  lane: TraceLane;
  at: number;
  durationMs: number;
}

export interface SnapshotAvailability {
  runtime: boolean;
  readouts: boolean;
  memory: boolean;
  trace: boolean;
}

export interface Snapshot {
  availability: SnapshotAvailability;
  machineMs: number;
  mode: string;
  syncState: number;
  syncLocked: boolean;
  capturePeriodTicks: number | null;
  captureCorrections: number;
  rpm: number;
  encodedSpeed: number;
  normalizedLoad: number;
  airMassFiltered: number;
  fuel: FuelResult | null;
  ignition: IgnitionResult | null;
  idle: IdleResult | null;
  limiter: {
    cutStageActive: boolean;
    cutStageComplement: boolean;
    countdown: number;
    limitRpm: number;
    resumeRpm: number;
  };
  limitByte: number;
  bufferByte: number;
  overrunActive: boolean;
  foregroundCycles: number;
  captureInterrupts: number;
  faultCount: number;
  cells: readonly number[];
}

export interface BenchIdentity {
  backend: 'cleanroom' | 'mame';
  controller: string;
  processor: string;
  bosch: string | null;
  software: string | null;
  checksum: { computed: number; passed: boolean } | null;
  resetTrace: readonly number[] | null;
}

export interface BenchProvenance {
  mode: 'demo' | 'evidence';
  controls: 'read-write' | 'read-only';
  assumptions: 'editable' | 'read-only' | 'unavailable';
  qualification: string;
  summary: string;
  values: Readonly<Assumptions> | null;
  entries: readonly DisclosureEntry[];
  openQuestions: readonly string[];
}

export interface Bench {
  identity(): BenchIdentity;
  provenance(): BenchProvenance;
  isRunning(): boolean;
  start(): void;
  stop(): void;
  throttle(): number;
  setThrottle(value: number): void;
  brake(): number;
  setBrake(value: number): void;
  rpm(): number;
  tick(seconds: number): void;
  snapshot(): Snapshot;
  trace(): readonly TracePoint[];
  setAssumption(field: keyof Assumptions, value: number): void;
  resetAssumptions(): void;
  onRebuild(listener: () => void): void;
}
