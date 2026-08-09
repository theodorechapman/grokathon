import type { SweepReport } from './assumption-sweep.ts';
import type { AccuracyComparison, ProvenanceItem } from './audit-types.ts';

export interface SubsystemAccuracy {
  subsystem: string;
  evidenceCoverage: number;
  pass: number;
  fail: number;
  unknown: number;
  assumptionCount: number;
  unstableAssumptions: string[];
  scenarios: string[];
  priorityExperiment: string;
}

const DEFINITIONS = [
  { subsystem: 'kernel', comparison: ['kernel', 'interrupts'], inventory: ['kernel'], scenarios: ['cold-boot', 'warm-boot', 'stopped', 'watchdog-expiry'], experiment: 'Extend canonical MAME past initialization with correct Timer-2 IRQ behavior; record the actual 601a service sequence and timer reload cadence.' },
  { subsystem: 'hardware', comparison: ['hardware'], inventory: ['hardware'], scenarios: ['timer-rollover', 'watchdog-expiry'], experiment: 'Implement SAB80C515 external-3, compare/capture, ADC, watchdog, and extended interrupt registers in MAME, then gate exact SFR accesses and edges.' },
  { subsystem: 'crank-speed', comparison: ['timebase'], inventory: ['crank-sync', 'speed'], scenarios: ['cranking', 'sync', 'missing-tooth-fault', 'timer-rollover'], experiment: 'Measure crystal/prescaler and inject a documented crank waveform while tracing 2462/21d8, 003f:CRCH:CRCL, 003b, and loss-of-sync branches.' },
  { subsystem: 'sensors', comparison: ['api'], inventory: ['sensors', 'air-mass'], scenarios: ['adc-rails'], experiment: 'Bench known voltages and temperatures; capture ADC channels and RAM 0036-003a to establish routing and transfer functions.' },
  { subsystem: 'calibration', comparison: ['calibration'], inventory: ['calibration'], scenarios: ['idle', 'part-load', 'wide-open-throttle'], experiment: 'Replace synthetic directory/selector claims with exact canonical bytes and replay the 100 validated CODE:0400 cases through the TypeScript decoder.' },
  { subsystem: 'load-modes', comparison: [], inventory: ['load'], scenarios: ['stopped', 'cranking', 'idle', 'part-load', 'wide-open-throttle'], experiment: 'Trace CODE:6099 and 3610 with controlled speed/airflow inputs; recover the integer load equation and actual mode thresholds.' },
  { subsystem: 'fuel', comparison: ['fuel'], inventory: ['fuel'], scenarios: ['idle', 'part-load', 'wide-open-throttle', 'overrun', 'rev-limit'], experiment: 'Trace 3800 through 6b60/2178 to CC2/CC3 under known inputs; recover correction order, pulse storage, and cut endpoint.' },
  { subsystem: 'ignition', comparison: ['ignition'], inventory: ['ignition'], scenarios: ['sync', 'idle', 'part-load', 'rev-limit'], experiment: 'Trace Timer0/P1.5 from 21d8/27cc using crank stimuli; recover angle/dwell units and remove the incorrect CC2/CC3 ignition wiring.' },
  { subsystem: 'idle', comparison: ['idle'], inventory: ['idle'], scenarios: ['idle'], experiment: 'Trace 6bb7/6db6 and Timer1/P1.7 with load changes; identify target scaling and controller arithmetic.' },
  { subsystem: 'limiter-overrun', comparison: ['rev-limiter'], inventory: ['rev-limiter', 'overrun'], scenarios: ['overrun', 'rev-limit'], experiment: 'Drive speed through both record thresholds in canonical execution and observe BITS:0038/003a/003b, countdown 0052, and injector/ignition endpoints.' },
  { subsystem: 'adaptation-faults', comparison: ['faults'], inventory: ['adaptation', 'faults'], scenarios: ['adc-rails', 'missing-tooth-fault'], experiment: 'Run canonical ADC rail/missing-tooth cases and capture 9158/93ff/8e50 plus XRAM fault records and fallback substitutions.' },
  { subsystem: 'diagnostics', comparison: ['diagnostics'], inventory: ['diagnostics'], scenarios: ['malformed-diagnostics'], experiment: 'Capture a known-tool KW71 session and replay malformed frames to recover service bytes, echo state, timeout units, and actuator pairings.' },
  { subsystem: 'integrity', comparison: ['integrity'], inventory: ['integrity'], scenarios: ['cold-boot'], experiment: 'Corrupt one canonical ROM byte and one XRAM test location in instrumented execution; require the 4532 subtype 4/1 paths.' },
] as const;

export const buildAccuracyMatrix = (
  comparisons: readonly AccuracyComparison[],
  inventory: readonly ProvenanceItem[],
  sweep: SweepReport,
): SubsystemAccuracy[] => {
  const unstable = new Set(sweep.entries.filter((entry) => entry.unstable).map((entry) => entry.field));
  return DEFINITIONS.map((definition) => {
    const relevant = comparisons.filter((entry) => definition.comparison.includes(entry.subsystem as never));
    const assumptions = inventory.filter(
      (entry) =>
        entry.id.startsWith('assumption.') &&
        definition.inventory.includes(entry.subsystem as never),
    );
    const pass = relevant.filter((entry) => entry.status === 'pass').length;
    const fail = relevant.filter((entry) => entry.status === 'fail').length;
    const unknown = relevant.filter((entry) => entry.status === 'unknown').length;
    const total = pass + fail + unknown;
    return {
      subsystem: definition.subsystem,
      evidenceCoverage: total === 0 ? 0 : Number((pass / total).toFixed(3)),
      pass,
      fail,
      unknown,
      assumptionCount: assumptions.length,
      unstableAssumptions: assumptions
        .map((entry) => entry.name)
        .filter((field) => unstable.has(field as (typeof sweep.entries)[number]['field'])),
      scenarios: [...definition.scenarios],
      priorityExperiment: definition.experiment,
    };
  });
};
