import type { AccuracyXdataPlan } from './signal-contract.ts';

export const serializePlan = (plan: AccuracyXdataPlan): string => {
  const records: unknown[] = [
    {
      schema: plan.schema,
      scenarioId: plan.scenarioId,
      seed: plan.seed,
      ticksPerSecond: plan.ticksPerSecond,
    },
    ...plan.events,
  ];
  return `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
};
