import { readFileSync } from 'node:fs';

import { ASSUMPTION_INVENTORY } from './assumption-inventory.ts';
import type { ProvenanceItem } from './audit-types.ts';
import { CALIBRATION_CHOICES } from './calibration-choices.ts';
import { CONTROL_CHOICES } from './control-choices.ts';
import { DIAGNOSTIC_CHOICES } from './diagnostic-choices.ts';
import { KERNEL_CHOICES } from './kernel-choices.ts';
import { PATHS } from './paths.ts';

export const buildInventory = (): ProvenanceItem[] => [
  ...ASSUMPTION_INVENTORY,
  ...CALIBRATION_CHOICES,
  ...KERNEL_CHOICES,
  ...CONTROL_CHOICES,
  ...DIAGNOSTIC_CHOICES,
];

export const validateInventory = (items: readonly ProvenanceItem[]): void => {
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) throw new Error(`duplicate provenance id: ${item.id}`);
    ids.add(item.id);
    if (item.defectStatus && !item.defect) {
      throw new Error(`${item.id}: defect status requires historical defect text`);
    }
    const absolute = `${PATHS.repository}${item.source.file}`;
    const lines = readFileSync(absolute, 'utf8').split(/\r?\n/);
    const start = item.source.line - 1;
    const end = item.source.endLine ?? item.source.line;
    if (start < 0 || end > lines.length) {
      throw new Error(`${item.id}: evidence range ${item.source.line}-${end} is outside ${item.source.file}`);
    }
    const evidence = lines.slice(start, end).join('\n');
    if (!evidence.includes(item.source.needle)) {
      throw new Error(
        `${item.id}: "${item.source.needle}" absent at ${item.source.file}:${item.source.line}-${end}`,
      );
    }
  }
};

export const summarizeInventory = (items: readonly ProvenanceItem[]): Record<string, unknown> => {
  const countBy = (key: 'provenance' | 'impact' | 'subsystem'): Record<string, number> => {
    const counts: Record<string, number> = {};
    for (const item of items) counts[item[key]] = (counts[item[key]] ?? 0) + 1;
    return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
  };
  const historicalDefects = items.filter((item) => item.defect);
  return {
    total: items.length,
    explicitAssumptions: items.filter((item) => item.id.startsWith('assumption.')).length,
    additionalModelChoices: items.filter((item) => item.id.startsWith('choice.')).length,
    defects: historicalDefects.length,
    resolvedDefects: historicalDefects.filter((item) => item.defectStatus === 'resolved').length,
    openDefects: historicalDefects.filter((item) => item.defectStatus !== 'resolved').length,
    byProvenance: countBy('provenance'),
    byImpact: countBy('impact'),
    bySubsystem: countBy('subsystem'),
  };
};
