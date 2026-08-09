import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { connectRuntimeBridge } from './connect-runtime-bridge.ts';
import {
  headlessMameArguments,
  headlessMameEnvironment,
  verifyHeadlessMame,
} from './mame-headless-config.ts';

interface MameRuntimeOptions {
  mame: string;
  rom: string;
  runDirectory: string;
  socketPath: string;
  connectTimeoutMs?: number;
}

interface MameRuntimeSession {
  client: Awaited<ReturnType<typeof connectRuntimeBridge>>;
  output(): string;
  terminate(): void;
}

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

const maximumCapturedOutputCharacters = 2_000_000;

export const launchMameRuntime = async (
  options: MameRuntimeOptions,
): Promise<MameRuntimeSession> => {
  const mame = resolve(options.mame);
  await verifyHeadlessMame(mame);
  const runDirectory = resolve(options.runDirectory);
  const romDirectory = join(runDirectory, 'roms', 'motronic175');
  const cfgDirectory = join(runDirectory, 'cfg');
  const romLink = join(romDirectory, 'totalcombinedrom.bin');
  mkdirSync(romDirectory, { recursive: true });
  mkdirSync(cfgDirectory, { recursive: true });
  rmSync(romLink, { force: true });
  rmSync(options.socketPath, { force: true });
  symlinkSync(resolve(options.rom), romLink);

  let output = '';
  let exited = false;
  const appendOutput = (data: string): void => {
    output = `${output}${data}`;
    if (output.length > maximumCapturedOutputCharacters) {
      output = output.slice(-maximumCapturedOutputCharacters);
    }
  };
  const child = spawn(
    mame,
    [
      'motronic175',
      '-rompath',
      join(runDirectory, 'roms'),
      '-cfg_directory',
      cfgDirectory,
      ...headlessMameArguments,
      '-nothrottle',
      '-nosleep',
      '-nowriteconfig',
      '-skip_gameinfo',
      '-oslog',
    ],
    {
      cwd: runDirectory,
      env: {
        ...process.env,
        ...headlessMameEnvironment,
        MOTRONIC_BRIDGE_SOCKET: options.socketPath,
        MOTRONIC_BRIDGE_TIMEOUT_MS: '600000',
        MOTRONIC_XRAM_RESET: 'zero',
        MOTRONIC_UNKNOWN_POLICY: 'stop',
        MOTRONIC_XDATA_EVENT_LIMIT: '0',
        MOTRONIC_XDATA_TRACE_EVENTS: '0',
        MOTRONIC_SIGNAL_SCENARIO: 'off',
        MOTRONIC_ADC_PROFILE: 'key-on',
        MOTRONIC_CONTINUE_FOREGROUND: '1',
        MOTRONIC_INSTRUCTION_LIMIT: '1000000000',
        MOTRONIC_TIMEOUT_MS: '60000',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (data) => {
    appendOutput(data);
  });
  child.stderr.on('data', (data) => {
    appendOutput(data);
  });
  child.on('error', (error) => {
    appendOutput(`\nMAME process error: ${error.message}\n`);
  });
  child.on('exit', (code, signal) => {
    exited = true;
    appendOutput(`\nMAME process exit code=${String(code)} signal=${String(signal)}\n`);
  });

  const deadline = Date.now() + (options.connectTimeoutMs ?? 10_000);
  let lastError: Error | null = null;
  while (!exited && Date.now() < deadline) {
    try {
      const client = await connectRuntimeBridge(options.socketPath, 5_000);
      return {
        client,
        output: () => output,
        terminate: () => {
          client.close();
          if (!exited) child.kill('SIGTERM');
        },
      };
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));
      await delay(25);
    }
  }
  if (!exited) child.kill('SIGTERM');
  throw new Error(
    `MAME bridge did not become ready: ${lastError?.message ?? 'process exited'}\n${output}`,
  );
};
