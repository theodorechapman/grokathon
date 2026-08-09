import type {
  BenchIdentity,
  BenchProvenance,
  Snapshot,
  TracePoint,
} from '../app/bench.ts';

export interface GatewayMode {
  schema: 'motronic.gateway.mode/v1';
  backend: 'mame';
  mode: BenchProvenance['mode'];
  controls: BenchProvenance['controls'];
}

export interface GatewayProvenance {
  schema: 'motronic.gateway.provenance/v1';
  identity: BenchIdentity;
  provenance: BenchProvenance;
}

export interface GatewayState {
  schema: 'motronic.gateway.state/v1';
  sequence: number;
  running: boolean;
  controls: {
    throttle: number;
    brake: number;
  };
  snapshot: Snapshot;
  trace: readonly TracePoint[];
}

export type GatewayControl =
  | { control: 'running'; value: boolean }
  | { control: 'throttle' | 'brake'; value: number };

export interface GatewaySource {
  identity(): BenchIdentity;
  provenance(): BenchProvenance;
  state(): GatewayState;
  control(command: GatewayControl, signal: AbortSignal): void | Promise<void>;
  subscribe(listener: (state: GatewayState) => void): () => void;
}
