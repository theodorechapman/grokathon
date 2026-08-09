import { DEFAULT_ASSUMPTIONS, msToTicks, timerClockHz, type Assumptions } from '../../../../../cleanroom/src/assumptions.ts';
import { createEcu } from '../../../../../cleanroom/src/ecu.ts';

import { fixedCaptureTicks } from './scenarios.ts';

export interface SweepEntry {
  field: keyof Assumptions;
  baseline: number;
  perturbed: number;
  unstable: boolean;
  changedOutputs: string[];
}

export interface SweepReport {
  method: string;
  fixedStimulus: Record<string, unknown>;
  entries: SweepEntry[];
}

const perturb = (value: number): number => {
  if (Number.isInteger(value)) {
    if (value === 0) return 1;
    const candidate = Math.round(value * 1.25);
    return candidate === value ? value + Math.sign(value || 1) : candidate;
  }
  return value === 0 ? 0.1 : value * 1.25;
};

const normalize = (value: unknown): unknown => {
  if (typeof value === 'number') return Number.isFinite(value) ? Number(value.toFixed(9)) : String(value);
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, normalize(entry)]),
    );
  }
  return value;
};

const flatten = (value: unknown, prefix = ''): Record<string, string> => {
  if (typeof value !== 'object' || value === null) return { [prefix]: JSON.stringify(value) };
  const output: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof entry === 'object' && entry !== null && !Array.isArray(entry)) {
      Object.assign(output, flatten(entry, path));
    } else {
      output[path] = JSON.stringify(entry);
    }
  }
  return output;
};

const probe = (overrides: Partial<Assumptions>): Record<string, unknown> => {
  const ecu = createEcu({ assumptions: overrides });
  ecu.powerOn();
  ecu.setAnalogInput(0, 0x40);
  ecu.setAnalogInput(1, 0x90);
  ecu.setAnalogInput(2, 0x70);
  ecu.setAnalogInput(3, 0x80);
  ecu.setAnalogInput(4, 0x60);
  ecu.setAnalogInput(5, 0xa0);
  ecu.parts.adc.scan();
  fixedCaptureTicks(ecu, 500, 8);
  ecu.parts.load.update();
  const fuel = ecu.parts.fuel.update();
  const ignition = ecu.parts.ignition.update();
  const idle = ecu.parts.idle.update();
  ecu.parts.session.service();
  ecu.step(3_000);
  const assumptions = ecu.context.assumptions;
  return normalize({
    clockMs: ecu.machine.ms(),
    timerClockHz: timerClockHz(assumptions),
    foregroundPeriodTicks: msToTicks(assumptions, assumptions.foregroundCycleMs),
    watchdogTimeoutTicks: msToTicks(assumptions, assumptions.watchdogTimeoutMs),
    watchdogRemaining: ecu.machine.watchdog.remainingTicks(),
    timer1Services: ecu.supervisor.services,
    executiveCycles: ecu.executive.cycles,
    sync: {
      locked: ecu.parts.sync.isLocked(),
      rpm: ecu.parts.sync.speed()?.rpm ?? null,
      proportional: ecu.parts.sync.speed()?.proportional ?? null,
    },
    mode: ecu.parts.load.operatingMode(),
    sensors: {
      supply: ecu.parts.sensors.supplyVolts(),
      coolant: ecu.parts.sensors.coolantDegC(),
      intake: ecu.parts.sensors.intakeAirDegC(),
      speed: ecu.parts.sensors.engineSpeedRpm(),
    },
    fuel,
    ignition,
    idle,
    limiter: ecu.parts.limiter.state(),
    serialBytes: [...ecu.machine.serial.txLog],
    outputKinds: ecu.machine.events.map((event) => event.kind),
    outputDurations: ecu.machine.events.map((event) => event.durationTicks ?? null),
  }) as Record<string, unknown>;
};

export const sweepAssumptions = (): SweepReport => {
  const baselineOutput = flatten(probe({}));
  const entries: SweepEntry[] = [];
  for (const field of Object.keys(DEFAULT_ASSUMPTIONS) as Array<keyof Assumptions>) {
    const baseline = DEFAULT_ASSUMPTIONS[field];
    const perturbed = perturb(baseline);
    const overrides: Partial<Assumptions> = { [field]: perturbed };
    const changedOutput = flatten(probe(overrides));
    const keys = new Set([...Object.keys(baselineOutput), ...Object.keys(changedOutput)]);
    const changedOutputs = [...keys].filter((key) => baselineOutput[key] !== changedOutput[key]).sort();
    entries.push({ field, baseline, perturbed, unstable: changedOutputs.length > 0, changedOutputs });
  }
  return {
    method: 'One-at-a-time +25% perturbation against a fixed 500-tick capture stream; comparisons use normalized externally visible API/state/output values.',
    fixedStimulus: { capturePeriodTicks: 500, captures: 8, adc: [0x40, 0x90, 0x70, 0x80, 0x60, 0xa0] },
    entries,
  };
};
