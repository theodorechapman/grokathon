#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { launchMameRuntime } from '../src/launch-mame-runtime.ts';
import { runRuntimeScenario } from '../src/run-runtime-scenario.ts';
import { runtimeScenarios } from '../src/runtime-scenarios.ts';
import { serializeRuntimeRun } from '../src/serialize-runtime-run.ts';

const ROM_SHA256 = 'e262e6aa26ddf6c7c8aa02f636d422709309e0a08945739b84886204d1693e33';

interface Arguments {
  mame: string;
  rom: string;
  runDirectory: string;
  outputDirectory: string;
  scenario: string;
}

const argumentsFrom = (values: string[]): Arguments => {
  const result: Record<string, string> = {};
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith('--') || value === undefined) {
      throw new Error('arguments must be --name value pairs');
    }
    result[key.slice(2)] = value;
  }
  for (const key of ['mame', 'rom', 'run-dir', 'output-dir']) {
    if (!result[key]) throw new Error(`--${key} is required`);
  }
  return {
    mame: result.mame!,
    rom: result.rom!,
    runDirectory: result['run-dir']!,
    outputDirectory: result['output-dir']!,
    scenario: result.scenario ?? 'all',
  };
};

const digest = (value: string | Uint8Array): string =>
  createHash('sha256').update(value).digest('hex');

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

const execute = async (
  args: Arguments,
  scenario: (typeof runtimeScenarios)[number],
  repeat: number,
): Promise<{ text: string; processOutput: string }> => {
  const runDirectory = join(resolve(args.runDirectory), `${scenario.id}-${repeat}`);
  const socketPath = `/tmp/motronic-live-${process.pid}-${scenario.id}-${repeat}.sock`;
  const session = await launchMameRuntime({
    mame: args.mame,
    rom: args.rom,
    runDirectory,
    socketPath,
  });
  try {
    const result = await runRuntimeScenario(session.client, scenario);
    await delay(25);
    return { text: serializeRuntimeRun(result), processOutput: session.output() };
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${scenario.id} repeat ${repeat}: ${detail}\n${session.output()}`);
  } finally {
    session.terminate();
  }
};

const main = async (): Promise<void> => {
  const args = argumentsFrom(process.argv.slice(2));
  if (digest(readFileSync(resolve(args.rom))) !== ROM_SHA256) {
    throw new Error('canonical ROM SHA-256 mismatch');
  }
  const selected =
    args.scenario === 'all'
      ? runtimeScenarios
      : runtimeScenarios.filter((scenario) => scenario.id === args.scenario);
  if (selected.length === 0) throw new Error(`unknown scenario: ${args.scenario}`);
  mkdirSync(resolve(args.outputDirectory), { recursive: true });
  const summary: Array<{
    scenarioId: string;
    status: string;
    detail: string;
    sha256: string;
  }> = [];

  for (const scenario of selected) {
    const first = await execute(args, scenario, 1);
    const second = await execute(args, scenario, 2);
    if (first.text !== second.text) {
      writeFileSync(
        join(resolve(args.outputDirectory), `${scenario.id}-nondeterministic.log`),
        `${first.text}\n--- repeat ---\n${second.text}`,
        'utf8',
      );
      throw new Error(`${scenario.id}: repeated runtime streams differ`);
    }
    const metadata = JSON.parse(first.text.split('\n')[0]!) as {
      status: string;
      detail: string;
    };
    writeFileSync(
      join(resolve(args.outputDirectory), `${scenario.id}.ndjson`),
      first.text,
      'utf8',
    );
    writeFileSync(
      join(resolve(args.outputDirectory), `${scenario.id}.mame.log`),
      first.processOutput,
      'utf8',
    );
    summary.push({
      scenarioId: scenario.id,
      status: metadata.status,
      detail: metadata.detail,
      sha256: digest(first.text),
    });
    process.stdout.write(`${scenario.id}: ${metadata.status} (${metadata.detail})\n`);
  }
  writeFileSync(
    join(resolve(args.outputDirectory), 'summary.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
    'utf8',
  );
};

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
