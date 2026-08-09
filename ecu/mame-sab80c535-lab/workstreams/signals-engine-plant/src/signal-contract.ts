export const SIGNAL_SCHEMA = 'motronic-signals/v1' as const;

export type ByteVector = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export interface AssumptionProvenance {
  id: string;
  claim: string;
  confidence: 'firmware-proof' | 'corroborated' | 'assumed' | 'unknown';
  sources: string[];
  excludes: string[];
}

export interface BoardStatus {
  /** Input value returned by a read; output writes are observed separately. */
  a040: number;
  /** Input value returned by a read; output writes are observed separately. */
  a041: number;
  a081: number;
}

export interface DigitalPorts {
  p3: number;
  p5: number;
  p6: number;
}

export interface StimulusFrame {
  tick: number;
  boardStatus: BoardStatus;
  adc: ByteVector;
  digitalPorts: DigitalPorts;
}

export interface CrankEdge {
  tick: number;
  endpoint: 'external-3/CC0';
  edge: 'falling';
}

export interface DiagnosticByte {
  tick: number;
  endpoint: 'UART/RXD';
  value: number;
}

export type OracleHook =
  | {
      id: string;
      source: 'p1';
      mask: number;
      role: string;
      expectation: 'record-transitions';
      evidence: string[];
    }
  | {
      id: string;
      source: 'sfr-write';
      addresses: number[];
      role: string;
      expectation: 'record-schedules';
      evidence: string[];
    }
  | {
      id: string;
      source: 'xdata-write' | 'xdata-access';
      addresses?: number[];
      ranges?: Array<[number, number]>;
      role: string;
      expectation: 'record-values';
      evidence: string[];
    }
  | {
      id: string;
      source: 'pc';
      addresses: number[];
      role: string;
      expectation: 'record-progress';
      evidence: string[];
    };

export interface SignalContract {
  schema: typeof SIGNAL_SCHEMA;
  id: string;
  title: string;
  seed: number;
  qualification: string;
  timebase: {
    ticksPerSecond: number;
    unit: 'bench-tick';
    sampleEveryTicks: number;
    interpolation: 'linear-then-nearest';
    byteQuantization: 'nearest-ties-up-saturate-u8';
  };
  durationTicks: number;
  assumptions: AssumptionProvenance[];
  frames: StimulusFrame[];
  crankEdges: CrankEdge[];
  diagnosticBytes: DiagnosticByte[];
  oracleHooks: OracleHook[];
}

export interface InputKeyframe {
  tick: number;
  adc: ByteVector;
  boardStatus?: BoardStatus;
  digitalPorts?: DigitalPorts;
  /** Abstract interval only. Zero means no edge source. */
  crankPeriodTicks: number;
}

export interface ScenarioSpec {
  id: string;
  title: string;
  seed: number;
  durationTicks: number;
  noiseAmplitude: number;
  keyframes: InputKeyframe[];
  diagnosticBytes?: DiagnosticByte[];
  assumptionIds?: string[];
}

export type AdapterEvent =
  | { tick: number; kind: 'xdata-input'; address: number; value: number }
  | { tick: number; kind: 'adc-input'; channel: number; value: number }
  | { tick: number; kind: 'port-input'; port: 3 | 5 | 6; value: number }
  | { tick: number; kind: 'cc0-edge'; edge: 'falling' }
  | { tick: number; kind: 'uart-byte'; value: number };

export interface AccuracyXdataPlan {
  schema: 'accuracy-xdata-signal-plan/v1';
  scenarioId: string;
  seed: number;
  ticksPerSecond: number;
  initialEnvironment: Record<string, string>;
  events: AdapterEvent[];
  oracleHooks: OracleHook[];
  constraints: string[];
}

export interface TraceEvent {
  tick: number;
  kind: 'p1' | 'sfr-write' | 'xdata-read' | 'xdata-write' | 'pc';
  address?: number;
  value?: number;
}

export interface ObservationReport {
  scenarioId: string;
  hooks: Array<{
    id: string;
    role: string;
    count: number;
    firstTick: number | null;
    lastTick: number | null;
  }>;
}
