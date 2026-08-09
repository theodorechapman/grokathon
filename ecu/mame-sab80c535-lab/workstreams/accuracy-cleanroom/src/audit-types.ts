export type ProvenanceKind =
  | 'binary-proven'
  | 'runtime-proven'
  | 'xdf-community'
  | 'datasheet-derived'
  | 'inferred'
  | 'arbitrary-model';

export type ImpactCategory =
  | 'timebase'
  | 'calibration'
  | 'control-equation'
  | 'threshold'
  | 'scheduler'
  | 'address'
  | 'state-layout'
  | 'diagnostics'
  | 'actuator-wiring'
  | 'fault-behavior'
  | 'api-confidence';

export interface SourceEvidence {
  file: string;
  line: number;
  endLine?: number;
  needle: string;
}

export interface ProvenanceItem {
  id: string;
  name: string;
  value: unknown;
  provenance: ProvenanceKind;
  impact: ImpactCategory;
  subsystem: string;
  source: SourceEvidence;
  externalEvidence?: string[];
  sensitivity?: 'none' | 'low' | 'medium' | 'high' | 'unmeasured';
  defect?: string;
  defectStatus?: 'open' | 'resolved';
}

export type ComparisonStatus = 'pass' | 'fail' | 'unknown';

export interface AccuracyComparison {
  id: string;
  subsystem: string;
  claim: string;
  status: ComparisonStatus;
  modelValue: unknown;
  evidenceValue: unknown;
  evidence: string[];
  reason: string;
}

export interface TraceEvent {
  kind: 'provenance' | 'run' | 'input' | 'access' | 'interrupt' | 'service' | 'state' | 'output';
  cycles: number;
  source: string;
  profile: string;
  runtime?: boolean;
  space?: 'idata' | 'xdata' | 'sfr' | 'port';
  access?: 'read' | 'write';
  address?: string;
  data?: string;
  pc?: string;
  name?: string;
  before?: unknown;
  after?: unknown;
  detail?: Record<string, unknown>;
}

export interface ScenarioResult {
  name: string;
  qualification: 'cleanroom-model-execution';
  events: TraceEvent[];
  observations: Record<string, unknown>;
}

export interface EvidenceBundle {
  canonicalHash: string;
  resetPath: string[];
  vectors: Record<string, { vector: number; wrapper: number | null }>;
  sfr: Record<string, number>;
  masterDirectory: { base: number; entries: number };
  checksum: { address: number; value: number; coverageEnd: number };
  revLimit: { primary: number; secondary: number; limit: number; buffer: number };
  outputEndpoints: Record<string, string>;
}
