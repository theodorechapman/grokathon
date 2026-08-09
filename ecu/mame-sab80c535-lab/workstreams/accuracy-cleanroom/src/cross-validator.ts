import { SPEC_PROVEN } from '../../../../../cleanroom/src/assumptions.ts';
import { MASTER_DIRECTORY_BASE, MASTER_DIRECTORY_ENTRIES } from '../../../../../cleanroom/src/calibration/calibration-image.ts';
import { createEcu } from '../../../../../cleanroom/src/ecu.ts';
import { REV_LIMIT } from '../../../../../cleanroom/src/calibration/rev-limit-record.ts';
import { RESET_TRACE } from '../../../../../cleanroom/src/kernel/reset.ts';
import { VECTOR_TABLE } from '../../../../../cleanroom/src/kernel/vector-table.ts';
import { SFR } from '../../../../../cleanroom/src/memory-map.ts';

import type { AccuracyComparison, ComparisonStatus, EvidenceBundle } from './audit-types.ts';

export interface ModelFacts {
  resetPath: number[];
  vectors: Record<string, { vector: number; wrapper: number }>;
  sfr: Record<string, number>;
  masterDirectory: { base: number; entries: number };
  checksum: { address: number; value: number; coverageEnd: number };
  revLimit: { primary: number; secondary: number; limit: number; buffer: number };
  scaledEngineeringConfidence: Record<string, string>;
  outputEndpoints: Record<string, string>;
}

const scaledEngineeringConfidence = (): Record<string, string> => {
  const sensors = createEcu().parts.sensors;
  return {
    supply: sensors.supplyVolts().confidence,
    coolant: sensors.coolantDegC().confidence,
    intakeAir: sensors.intakeAirDegC().confidence,
    engineSpeed: sensors.engineSpeedRpm().confidence,
    load: sensors.normalizedLoad().confidence,
  };
};

export const extractModelFacts = (): ModelFacts => ({
  resetPath: [...RESET_TRACE],
  vectors: Object.fromEntries(
    VECTOR_TABLE.map((entry) => [entry.source, { vector: entry.vector, wrapper: entry.wrapper }]),
  ),
  sfr: { ...SFR },
  masterDirectory: { base: MASTER_DIRECTORY_BASE, entries: MASTER_DIRECTORY_ENTRIES },
  checksum: {
    address: 0x9f00,
    value: SPEC_PROVEN.romChecksum,
    coverageEnd: SPEC_PROVEN.checksumCoverageEnd,
  },
  revLimit: {
    primary: REV_LIMIT.primaryLimitAddress,
    secondary: REV_LIMIT.secondaryLimitAddress,
    limit: REV_LIMIT.limitByte,
    buffer: REV_LIMIT.bufferByte,
  },
  scaledEngineeringConfidence: scaledEngineeringConfidence(),
  outputEndpoints: {
    ignition: 'CC2/CC3',
    injectors: 'logical events only',
    idle: 'logical event only',
  },
});

const same = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);

const comparison = (
  id: string,
  subsystem: string,
  claim: string,
  modelValue: unknown,
  evidenceValue: unknown,
  evidence: string[],
  unknownReason?: string,
): AccuracyComparison => {
  const status: ComparisonStatus = unknownReason ? 'unknown' : same(modelValue, evidenceValue) ? 'pass' : 'fail';
  return {
    id,
    subsystem,
    claim,
    status,
    modelValue,
    evidenceValue: unknownReason ? null : evidenceValue,
    evidence,
    reason: unknownReason ?? (status === 'pass' ? 'Exact evidence-supported invariant match.' : 'Model differs from external evidence.'),
  };
};

export const compareFacts = (
  model: ModelFacts,
  evidence: EvidenceBundle,
): AccuracyComparison[] => {
  const results: AccuracyComparison[] = [
    comparison('reset.path', 'kernel', 'ordered reset PC path', model.resetPath, evidence.resetPath.map((pc) => Number.parseInt(pc, 16)), ['e2e-analysis/traces/validation-summary.json:2-23', 'validation-stimuli/logs/reset-events.ndjson:2-18']),
    comparison('checksum', 'integrity', 'checksum address, range, and value', model.checksum, evidence.checksum, ['e2e-analysis/integrity.json:2-38']),
    comparison('master-directory.base', 'calibration', 'master pointer directory base', model.masterDirectory.base, evidence.masterDirectory.base, ['e2e-analysis/calibration-index.json:2-7']),
    comparison('master-directory.count', 'calibration', 'master pointer directory entry count', model.masterDirectory.entries, evidence.masterDirectory.entries, ['e2e-analysis/calibration-index.json:2-7']),
    comparison('rev-limit', 'rev-limiter', 'raw rev-limit addresses and bytes', model.revLimit, evidence.revLimit, ['e2e-analysis/traces/scenarios.json:231-241']),
  ];

  for (const [source, expected] of Object.entries(evidence.vectors)) {
    if (source === 'reset') continue;
    const actual = model.vectors[source];
    results.push(comparison(`vector.${source}`, 'interrupts', `${source} vector and wrapper`, actual ?? null, expected, ['e2e-analysis/hardware-model.json:2-370']));
  }

  for (const name of ['IEN0', 'IP0', 'IEN1', 'IRCON', 'CCEN', 'CCL2', 'CCH2', 'CCL3', 'CCH3', 'T2CON', 'CRCL', 'CRCH', 'TH2', 'ADCON0', 'ADDAT', 'DAPR']) {
    results.push(comparison(`sfr.${name}`, 'hardware', `${name} SFR address`, model.sfr[name] ?? null, evidence.sfr[name] ?? null, ['e2e-analysis/hardware-model.json:374-2956']));
  }

  results.push(
    comparison('output.ignition', 'ignition', 'logical ignition endpoint', model.outputEndpoints.ignition, evidence.outputEndpoints.ignition_coil_drive, ['e2e-analysis/hardware-model.json:3101-3110']),
    comparison('output.injectors', 'fuel', 'logical injector endpoints', model.outputEndpoints.injectors, `${evidence.outputEndpoints.injector_bank_a_drive}; ${evidence.outputEndpoints.injector_bank_b_drive}`, ['e2e-analysis/hardware-model.json:3111-3128']),
    comparison('output.idle', 'idle', 'logical idle actuator endpoint', model.outputEndpoints.idle, evidence.outputEndpoints.iac_valve_drive, ['e2e-analysis/hardware-model.json:3129-3138']),
    comparison('confidence.scaled-units', 'api', 'confidence of engineering-unit APIs', model.scaledEngineeringConfidence, { supply: 'unknown', coolant: 'unknown', intakeAir: 'unknown', engineSpeed: 'unknown', load: 'unknown' }, ['e2e-analysis/OPEN-QUESTIONS.md:39-54']),
    comparison('calibration.bytes', 'calibration', 'synthetic payload values equal production calibration', 'synthetic', null, ['cleanroom/src/calibration/payload-shapes.ts:1-10'], 'Production bytes are intentionally absent; numeric payload comparison is unsupported.'),
    comparison('scheduler.order', 'kernel', 'full foreground service order matches firmware', 'model-local order', null, ['cleanroom/src/ecu-services.ts:1-8'], 'External artifacts prove a cooperative executive, not the cleanroom service sequence.'),
    comparison('diagnostics.service-codes', 'diagnostics', 'model service bytes equal KW71 command dictionary', '0x00..0x09', null, ['e2e-analysis/OPEN-QUESTIONS.md:56-63'], 'The command dictionary is unresolved.'),
    comparison('fault.thresholds', 'faults', 'ADC rail and plausibility thresholds match ROM', '0x02/0xfd and model rules', null, ['e2e-analysis/subsystems/03-sensor-acquisition.md:171-181'], 'Exact production fault thresholds are unresolved.'),
    comparison('timing.engineering-units', 'timebase', 'oscillator-derived engineering time is production-correct', '12 MHz / 12', null, ['e2e-analysis/OPEN-QUESTIONS.md:39-54'], 'Oscillator and timer prescaler evidence is unavailable.'),
  );
  return results;
};

export const requireNoFalsePasses = (results: readonly AccuracyComparison[]): void => {
  for (const result of results) {
    if (result.status === 'pass' && (result.evidenceValue === null || result.evidence.length === 0)) {
      throw new Error(`${result.id}: unsupported comparison was marked pass`);
    }
  }
};
