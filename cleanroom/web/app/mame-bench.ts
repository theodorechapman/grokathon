import type { Assumptions } from '../../src/assumptions.ts';
import type {
  Bench,
  BenchIdentity,
  BenchProvenance,
  Snapshot,
  TracePoint,
} from './bench.ts';
import type {
  GatewayControl,
  GatewayMode,
  GatewayProvenance,
  GatewayState,
} from '../gateway/gateway-contract.ts';

const REQUEST_TIMEOUT_MS = 3_000;

const unavailableSnapshot = (): Snapshot => ({
  availability: { runtime: false, readouts: false, memory: false, trace: false },
  machineMs: 0,
  mode: 'unavailable',
  syncState: 0,
  syncLocked: false,
  capturePeriodTicks: null,
  captureCorrections: 0,
  rpm: 0,
  encodedSpeed: 0,
  normalizedLoad: 0,
  airMassFiltered: 0,
  fuel: null,
  ignition: null,
  idle: null,
  limiter: {
    cutStageActive: false,
    cutStageComplement: false,
    countdown: 0,
    limitRpm: 0,
    resumeRpm: 0,
  },
  limitByte: 0,
  bufferByte: 0,
  overrunActive: false,
  foregroundCycles: 0,
  captureInterrupts: 0,
  faultCount: 0,
  cells: [],
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error('MAME gateway returned invalid JSON');
  }
};

const readMode = (value: unknown): GatewayMode => {
  if (
    !isRecord(value) ||
    value.schema !== 'motronic.gateway.mode/v1' ||
    value.backend !== 'mame' ||
    (value.mode !== 'demo' && value.mode !== 'evidence') ||
    (value.controls !== 'read-write' && value.controls !== 'read-only')
  ) {
    throw new Error('MAME gateway mode response does not match v1');
  }
  return value as unknown as GatewayMode;
};

const readProvenance = (value: unknown): GatewayProvenance => {
  if (
    !isRecord(value) ||
    value.schema !== 'motronic.gateway.provenance/v1' ||
    !isRecord(value.identity) ||
    value.identity.backend !== 'mame' ||
    !isRecord(value.provenance)
  ) {
    throw new Error('MAME gateway provenance response does not match v1');
  }
  return value as unknown as GatewayProvenance;
};

const readState = (value: unknown): GatewayState => {
  if (
    !isRecord(value) ||
    value.schema !== 'motronic.gateway.state/v1' ||
    typeof value.sequence !== 'number' ||
    typeof value.running !== 'boolean' ||
    !isRecord(value.controls) ||
    !isRecord(value.snapshot) ||
    !Array.isArray(value.trace)
  ) {
    throw new Error('MAME gateway state event does not match v1');
  }
  return value as unknown as GatewayState;
};

const fetchJson = async (url: URL): Promise<unknown> => {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`${url.pathname} returned HTTP ${response.status}`);
  return parseJson(await response.text());
};

export const createMameBench = (baseUrl: string): Bench => {
  let identity: BenchIdentity = {
    backend: 'mame',
    controller: 'MAME gateway',
    processor: 'SAB80C515',
    bosch: null,
    software: null,
    checksum: null,
    resetTrace: null,
  };
  let provenance: BenchProvenance = {
    mode: 'evidence',
    controls: 'read-only',
    assumptions: 'unavailable',
    qualification: 'waiting for MAME gateway provenance',
    summary: 'No MAME claim is displayed until the gateway supplies it.',
    values: null,
    entries: [],
    openQuestions: [],
  };
  let state: GatewayState = {
    schema: 'motronic.gateway.state/v1',
    sequence: -1,
    running: false,
    controls: { throttle: 0, brake: 0 },
    snapshot: unavailableSnapshot(),
    trace: [],
  };
  let failure: Error | null = null;
  const listeners: Array<() => void> = [];
  const endpoint = (path: string): URL => new URL(path, baseUrl);
  const reportFailure = (error: unknown): void => {
    failure = error instanceof Error ? error : new Error(String(error));
  };
  const notify = (): void => {
    for (const listener of listeners) listener();
  };
  const canControl = (): boolean =>
    provenance.mode === 'demo' && provenance.controls === 'read-write';

  const loadMetadata = async (): Promise<void> => {
    const [modePayload, provenancePayload] = await Promise.all([
      fetchJson(endpoint('/api/mode')),
      fetchJson(endpoint('/api/provenance')),
    ]);
    const mode = readMode(modePayload);
    const supplied = readProvenance(provenancePayload);
    identity = supplied.identity;
    provenance = {
      ...supplied.provenance,
      mode: mode.mode,
      controls: mode.mode === 'evidence' ? 'read-only' : mode.controls,
      assumptions:
        mode.mode === 'evidence' ? 'read-only' : supplied.provenance.assumptions,
    };
    notify();
  };

  const postControl = (control: GatewayControl): void => {
    if (!canControl()) return;
    void fetch(endpoint('/api/controls'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(control),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`/api/controls returned HTTP ${response.status}`);
        }
      })
      .catch(reportFailure);
  };

  void loadMetadata().catch(reportFailure);
  const events = new EventSource(endpoint('/api/events'));
  events.addEventListener('state', (event) => {
    if (!(event instanceof MessageEvent) || typeof event.data !== 'string') {
      reportFailure(new Error('MAME gateway emitted a non-message state event'));
      return;
    }
    try {
      const next = readState(parseJson(event.data));
      if (next.sequence >= state.sequence) state = next;
    } catch (error) {
      reportFailure(error);
    }
  });

  return {
    identity: () => identity,
    provenance: () => provenance,
    isRunning: () => state.running,
    start: () => postControl({ control: 'running', value: true }),
    stop: () => postControl({ control: 'running', value: false }),
    throttle: () => state.controls.throttle,
    setThrottle: (value) =>
      postControl({ control: 'throttle', value: Math.min(1, Math.max(0, value)) }),
    brake: () => state.controls.brake,
    setBrake: (value) =>
      postControl({ control: 'brake', value: Math.min(1, Math.max(0, value)) }),
    rpm: () => (state.snapshot.availability.readouts ? state.snapshot.rpm : 0),
    tick: () => {
      if (failure !== null) throw failure;
    },
    snapshot: () => state.snapshot,
    trace: (): readonly TracePoint[] => state.trace,
    setAssumption: (_field: keyof Assumptions, _value: number) => {
      throw new Error('MAME gateway assumptions are read-only');
    },
    resetAssumptions: () => {
      throw new Error('MAME gateway assumptions are read-only');
    },
    onRebuild: (listener) => listeners.push(listener),
  };
};
