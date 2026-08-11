#!/usr/bin/env node

import { existsSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createHttpGateway } from './http-gateway.ts';
import { createMameGatewaySource } from './mame-gateway-source.ts';

interface Arguments {
  mode: 'demo' | 'evidence';
  mame: string;
  rom: string;
  runDirectory: string;
  socketPath: string;
  htmlPath: string;
  port: number;
}

const readPairs = (values: string[]): Record<string, string> => {
  const pairs: Record<string, string> = {};
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith('--') || value === undefined) {
      throw new Error('gateway arguments must be --name value pairs');
    }
    pairs[key.slice(2)] = value;
  }
  return pairs;
};

const argumentsFrom = (values: string[]): Arguments => {
  const pairs = readPairs(values);
  const mode = pairs.mode ?? 'demo';
  if (mode !== 'demo' && mode !== 'evidence') {
    throw new Error('--mode must be demo or evidence');
  }
  const here = dirname(fileURLToPath(import.meta.url));
  const mame = pairs.mame ?? process.env.MOTRONIC_MAME;
  const rom = pairs.rom ?? process.env.MOTRONIC_ROM;
  if (!mame || !rom) throw new Error('--mame and --rom are required');
  // 8098 by default so the demo hub (web/serve.js, :8099) can run alongside
  // and proxy /api/* here.
  const port = Number(pairs.port ?? process.env.PORT ?? '8098');
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error('--port must be an integer in 0..65535');
  }
  return {
    mode,
    mame: resolve(mame),
    rom: resolve(rom),
    runDirectory: resolve(
      pairs['run-dir'] ?? `/tmp/motronic-gateway-${process.pid}`,
    ),
    socketPath:
      pairs.socket ?? `/tmp/motronic-gateway-${process.pid}.sock`,
    // The gateway's own page is the evidence bench — the report layout built
    // for evidence-bounded MAME runs. Other pages reach the gateway through
    // the demo hub's /api proxy instead.
    htmlPath: resolve(
      pairs.html ?? join(here, '..', 'dist', 'evidence-bench.html'),
    ),
    port,
  };
};

const main = async (): Promise<void> => {
  const args = argumentsFrom(process.argv.slice(2));
  for (const path of [args.mame, args.rom, args.htmlPath]) {
    if (!existsSync(path)) throw new Error(`required file does not exist: ${path}`);
  }
  const source = await createMameGatewaySource(args);
  const server = createHttpGateway({ htmlPath: args.htmlPath, source });
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(args.port, '127.0.0.1', resolveListen);
  });
  const address = server.address() as AddressInfo;
  process.stdout.write(
    `Motronic MAME ${args.mode} bench: http://127.0.0.1:${address.port}/\n`,
  );

  let closing = false;
  const close = (): void => {
    if (closing) return;
    closing = true;
    server.close(() => {
      void source.dispose().finally(() => {
        process.exitCode = 0;
      });
    });
    server.closeAllConnections();
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
};

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
