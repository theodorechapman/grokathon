import type { runRuntimeScenario } from './run-runtime-scenario.ts';

type Result = Awaited<ReturnType<typeof runRuntimeScenario>>;

export const serializeRuntimeRun = (result: Result): string => {
  const records: unknown[] = [
    {
      schema: 'motronic-runtime-run/v1',
      scenarioId: result.scenarioId,
      status: result.status,
      detail: result.detail,
      romSha256: result.ready.romSha256,
      mameCommit: result.ready.mameCommit,
      mode: 'demo',
    },
  ];
  records.push({ direction: 'command', message: result.commands[0] });
  records.push({ direction: 'response', message: result.ready });
  for (let index = 0; index < result.frames.length; index += 1) {
    records.push({ direction: 'command', message: result.commands[index + 1] });
    records.push({
      direction: 'plant',
      step: index,
      rpmMilli: result.plantRpmMilli[index],
    });
    records.push({ direction: 'response', message: result.frames[index] });
  }
  records.push({ direction: 'command', message: result.commands.at(-1) });
  return `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
};
