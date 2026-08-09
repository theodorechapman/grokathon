import type {
  BenchIdentity,
  BenchProvenance,
  Snapshot,
  TracePoint,
} from '../app/bench.ts';

interface RuntimeCounters {
  foreground: number;
  capture: number;
}

interface RuntimeTelemetry {
  cycle: number;
  kind: 'p1' | 'sfr-write' | 'xdata-write';
  bit?: number;
  state?: number;
  address?: number;
}

interface RuntimeInput {
  cycle: number;
  kind: string;
  state?: number;
}

export const mameIdentity = (): BenchIdentity => ({
  backend: 'mame',
  controller: 'Bosch Motronic M1.7 canonical firmware in MAME',
  processor: 'Siemens SAB80C515',
  bosch: '0261200175',
  software: '1267356378',
  checksum: null,
  resetTrace: null,
});

export const mameProvenance = (
  mode: 'demo' | 'evidence',
  romSha256: string,
  mameCommit: string,
): BenchProvenance => ({
  mode,
  controls: mode === 'demo' ? 'read-write' : 'read-only',
  assumptions: mode === 'demo' ? 'read-only' : 'unavailable',
  qualification:
    mode === 'demo'
      ? 'Canonical firmware execution; speed, wheel geometry, sensor transfer, and plant dynamics are disclosed demo assumptions.'
      : 'Canonical firmware and emulator identity only; assumed wheel and plant behavior are withheld.',
  summary:
    mode === 'demo'
      ? 'MAME runs in lockstep. Controls feed peripheral inputs through a deterministic synthetic engine plant.'
      : 'Evidence mode is intentionally static until a recovered, non-assumed stimulus is selected.',
  values: null,
  entries: [
    {
      field: 'romSha256',
      value: romSha256,
      basis: 'SHA-256 of the canonical combined ROM accepted by the bridge',
      kind: 'proven',
    },
    {
      field: 'mameCommit',
      value: mameCommit,
      basis: 'Pinned MAME source identity reported by the bridge',
      kind: 'proven',
    },
    ...(mode === 'demo'
      ? [
          {
            field: 'wheelGeometry',
            value: '12 positions, one synthetic gap',
            basis: 'selected demo fixture; production geometry is not recovered',
            kind: 'assumed' as const,
          },
          {
            field: 'plantStep',
            value: '10 ms per 10,000 accepted CPU cycles',
            basis: 'selected deterministic coupling; not a recovered oscillator or physical inertia',
            kind: 'assumed' as const,
          },
        ]
      : []),
  ],
  openQuestions: [
    'Production crank geometry and oscillator frequency remain unknown.',
    'Physical sensor transfer curves and output routing remain unknown.',
    'CC2/CC3 writes are logical schedule telemetry, not exact compare-pin waveforms.',
    'A complete KW71 UART session remains unproven.',
  ],
});

export const mameSnapshot = (
  mode: 'demo' | 'evidence',
  machineMs: number,
  rpmMilli: number,
  counters: RuntimeCounters | null,
): Snapshot => ({
  availability: {
    runtime: true,
    readouts: mode === 'demo',
    memory: false,
    trace: mode === 'demo',
  },
  machineMs,
  mode:
    mode === 'demo'
      ? 'MAME demo · internals unavailable'
      : 'MAME evidence · identity only',
  syncState: 0,
  syncLocked: false,
  capturePeriodTicks: null,
  captureCorrections: 0,
  rpm: rpmMilli / 1_000,
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
  foregroundCycles: counters?.foreground ?? 0,
  captureInterrupts: counters?.capture ?? 0,
  faultCount: 0,
  cells: [],
});

const plantMilliseconds = (cycle: number): number => cycle / 1_000;

export const appendMameTrace = (
  prior: readonly TracePoint[],
  inputs: readonly RuntimeInput[],
  telemetry: readonly RuntimeTelemetry[],
  machineMs: number,
): TracePoint[] => {
  const added: TracePoint[] = [];
  for (const event of inputs) {
    if (event.kind === 'cc0' && event.state === 1) {
      added.push({ lane: 'capture', at: plantMilliseconds(event.cycle), durationMs: 0 });
    }
  }
  for (const event of telemetry) {
    if (event.kind === 'p1' && event.bit === 5 && event.state === 0) {
      added.push({ lane: 'p15-ignition', at: plantMilliseconds(event.cycle), durationMs: 0 });
    }
    if (
      event.kind === 'sfr-write' &&
      event.address !== undefined &&
      event.address >= 0xc4 &&
      event.address <= 0xc7
    ) {
      added.push({
        lane: 'cc2-cc3-schedule',
        at: plantMilliseconds(event.cycle),
        durationMs: 0,
      });
    }
  }
  return [...prior, ...added].filter((point) => point.at >= machineMs - 100);
};
