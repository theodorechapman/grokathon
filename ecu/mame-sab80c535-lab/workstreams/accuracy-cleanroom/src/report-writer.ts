import { existsSync, writeFileSync } from 'node:fs';

import { buildAccuracyMatrix } from './accuracy-matrix.ts';
import { sweepAssumptions } from './assumption-sweep.ts';
import type { AccuracyComparison, ProvenanceItem, ScenarioResult } from './audit-types.ts';
import { CLAIM_DEFECTS } from './claim-defects.ts';
import { compareFacts, extractModelFacts, requireNoFalsePasses } from './cross-validator.ts';
import { EVIDENCE_FACTS } from './evidence-facts.ts';
import { loadEvidence } from './evidence-loader.ts';
import { buildInventory, summarizeInventory, validateInventory } from './inventory.ts';
import { PATHS } from './paths.ts';
import { runAllScenarios } from './scenarios.ts';
import { compactScenarioTrace } from './trace-report.ts';

const writeJson = (name: string, value: unknown): void => {
  writeFileSync(`${PATHS.reports}${name}`, `${JSON.stringify(value)}\n`, 'utf8');
};

const scenarioSummary = (scenarios: readonly ScenarioResult[]): unknown =>
  scenarios.map((scenario) => ({
    name: scenario.name,
    qualification: scenario.qualification,
    eventCounts: Object.fromEntries(
      [...new Set(scenario.events.map((event) => event.kind))]
        .sort()
        .map((kind) => [kind, scenario.events.filter((event) => event.kind === kind).length]),
    ),
    observations: scenario.observations,
  }));

const withSensitivity = (
  inventory: readonly ProvenanceItem[],
  sweep: ReturnType<typeof sweepAssumptions>,
): ProvenanceItem[] => {
  const byField = new Map(sweep.entries.map((entry) => [entry.field, entry]));
  return inventory.map((item) => {
    if (!item.id.startsWith('assumption.')) return item;
    const entry = byField.get(item.name as (typeof sweep.entries)[number]['field']);
    const count = entry?.changedOutputs.length ?? 0;
    const sensitivity = count === 0 ? 'none' : count < 4 ? 'low' : count < 10 ? 'medium' : 'high';
    return { ...item, sensitivity };
  });
};

const markdown = (
  inventory: readonly ProvenanceItem[],
  evidenceFacts: readonly ProvenanceItem[],
  comparisons: readonly AccuracyComparison[],
  sweep: ReturnType<typeof sweepAssumptions>,
  matrix: ReturnType<typeof buildAccuracyMatrix>,
  scenarios: readonly ScenarioResult[],
): string => {
  const summary = summarizeInventory(inventory);
  const evidenceSummary = summarizeInventory(evidenceFacts);
  const status = (value: AccuracyComparison['status']): number =>
    comparisons.filter((entry) => entry.status === value).length;
  const unstable = sweep.entries.filter((entry) => entry.unstable).map((entry) => entry.field);
  const stable = sweep.entries.filter((entry) => !entry.unstable).map((entry) => entry.field);
  const lines = [
    '# Clean-room fidelity audit',
    '',
    'This is a cross-validation report, not a self-consistency score. Unsupported comparisons remain `unknown`.',
    '',
    '## Inventory',
    '',
    `- Total inventoried inputs and choices: ${summary.total}.`,
    `- Explicit Assumptions fields: ${summary.explicitAssumptions}.`,
    `- Additional model-local choices: ${summary.additionalModelChoices}.`,
    `- Historical inventory defect notes: ${summary.defects} (${summary.resolvedDefects} resolved, ${summary.openDefects} open).`,
    `- Provenance categories: ${JSON.stringify(summary.byProvenance)}.`,
    `- Impact categories: ${JSON.stringify(summary.byImpact)}.`,
    '',
    '## Evidence taxonomy',
    '',
    `External evidence claims inventoried: ${evidenceSummary.total}; categories: ${JSON.stringify(evidenceSummary.byProvenance)}.`,
    'Binary proof, runtime proof, datasheet roles, community/XDF claims, inference, and arbitrary model choices remain distinct.',
    '',
    '## Cross-validation outcome',
    '',
    `- Pass: ${status('pass')}.`,
    `- Fail: ${status('fail')}.`,
    `- Unknown: ${status('unknown')}.`,
    '',
    ...comparisons
      .filter((entry) => entry.status !== 'pass')
      .map((entry) => `- **${entry.status.toUpperCase()} ${entry.id}:** ${entry.reason}`),
    '',
    '## Confidence/provenance defect history',
    '',
    ...CLAIM_DEFECTS.map((defect) => `- **${defect.status.toUpperCase()} · ${defect.severity.toUpperCase()} · ${defect.id}:** ${defect.correction}`),
    '',
    '## Deterministic scenario coverage',
    '',
    `All ${scenarios.length} requested scenarios executed: ${scenarios.map((scenario) => scenario.name).join(', ')}.`,
    'Their traces are cleanroom-model executions normalized to MAME-style access/interrupt/input/port concepts; they are not canonical-ROM runtime evidence.',
    '',
    '## Assumption sensitivity',
    '',
    `- Externally visible output changed for ${unstable.length}/${sweep.entries.length}: ${unstable.join(', ')}.`,
    `- No observed effect in the fixed probe for ${stable.length}/${sweep.entries.length}: ${stable.join(', ')}.`,
    '- “No observed effect” means unexercised or unused in this probe, not validated.',
    '',
    '## Highest-priority experiments',
    '',
    ...matrix.map(
      (entry, index) =>
        `${index + 1}. **${entry.subsystem}** (coverage ${Math.round(entry.evidenceCoverage * 100)}%): ${entry.priorityExperiment}`,
    ),
    '',
    '## Safety boundary',
    '',
    'Synthetic calibration, guessed engineering units, guessed branch thresholds, and model-local actuator wiring are unsuitable for tuning or safety decisions.',
  ];
  return `${lines.join('\n')}\n`;
};

export const generateReports = (): Record<string, unknown> => {
  if (!existsSync(PATHS.reports)) throw new Error(`report directory unavailable: ${PATHS.reports}`);
  const rawInventory = buildInventory();
  validateInventory(rawInventory);
  validateInventory(EVIDENCE_FACTS);
  const evidence = loadEvidence();
  const comparisons = compareFacts(extractModelFacts(), evidence);
  requireNoFalsePasses(comparisons);
  const sweep = sweepAssumptions();
  const inventory = withSensitivity(rawInventory, sweep);
  const scenarios = runAllScenarios();
  const matrix = buildAccuracyMatrix(comparisons, inventory, sweep);
  writeJson('provenance.json', {
    schema: 3,
    model: { summary: summarizeInventory(inventory), items: inventory },
    externalEvidence: { summary: summarizeInventory(EVIDENCE_FACTS), items: EVIDENCE_FACTS },
    claimDefects: CLAIM_DEFECTS,
  });
  writeJson('comparisons.json', { schema: 1, evidenceHash: evidence.canonicalHash, comparisons });
  writeJson('assumption-sensitivity.json', { schema: 1, ...sweep });
  writeJson('scenario-summary.json', { schema: 1, scenarios: scenarioSummary(scenarios) });
  writeJson('scenario-traces.json', {
    schema: 2,
    representation: 'all access/input/state events; exact counts and first/last samples for repeated interrupt/service/output series',
    scenarios: scenarios.map(compactScenarioTrace),
  });
  writeJson('accuracy-matrix.json', { schema: 1, subsystems: matrix });
  writeFileSync(`${PATHS.reports}accuracy-report.md`, markdown(inventory, EVIDENCE_FACTS, comparisons, sweep, matrix, scenarios), 'utf8');
  return {
    inventory: summarizeInventory(inventory),
    externalEvidence: summarizeInventory(EVIDENCE_FACTS),
    comparisons: { pass: comparisons.filter((entry) => entry.status === 'pass').length, fail: comparisons.filter((entry) => entry.status === 'fail').length, unknown: comparisons.filter((entry) => entry.status === 'unknown').length },
    claimDefects: {
      historical: CLAIM_DEFECTS.length,
      resolved: CLAIM_DEFECTS.filter((defect) => defect.status === 'resolved').length,
      open: CLAIM_DEFECTS.filter((defect) => defect.status === 'open').length,
    },
    scenarios: scenarios.length,
    unstableAssumptions: sweep.entries.filter((entry) => entry.unstable).length,
  };
};
