import { strict as assert } from 'node:assert';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import type {
  BenchIdentity,
  BenchProvenance,
  Snapshot,
} from '../app/bench.ts';
import type {
  GatewayControl,
  GatewayProvenance,
  GatewaySource,
  GatewayState,
} from '../gateway/gateway-contract.ts';
import { createHttpGateway } from '../gateway/http-gateway.ts';

const snapshot = (): Snapshot => ({
  availability: { runtime: true, readouts: false, memory: false, trace: false },
  machineMs: 12,
  mode: 'unavailable',
  syncState: 0,
  syncLocked: false,
  capturePeriodTicks: null,
  captureCorrections: 0,
  rpm: 0,
  encodedSpeed: 0,
  normalizedLoad: 0,
  airMassFiltered: 0,
  fuel: null,
  ignition: null,
  idle: null,
  limiter: {
    cutStageActive: false,
    cutStageComplement: false,
    countdown: 0,
    limitRpm: 0,
    resumeRpm: 0,
  },
  limitByte: 0,
  bufferByte: 0,
  overrunActive: false,
  foregroundCycles: 0,
  captureInterrupts: 0,
  faultCount: 0,
  cells: [],
});

class MockSource implements GatewaySource {
  readonly commands: GatewayControl[] = [];
  private readonly listeners = new Set<(state: GatewayState) => void>();
  private readonly sourceProvenance: BenchProvenance;
  private current: GatewayState = {
    schema: 'motronic.gateway.state/v1',
    sequence: 7,
    running: false,
    controls: { throttle: 0, brake: 0 },
    snapshot: snapshot(),
    trace: [],
  };

  constructor(mode: 'demo' | 'evidence') {
    this.sourceProvenance = {
      mode,
      controls: mode === 'demo' ? 'read-write' : 'read-only',
      assumptions: mode === 'demo' ? 'unavailable' : 'read-only',
      qualification: 'mock test source; no MAME fact claim',
      summary: 'Gateway transport fixture only.',
      values: null,
      entries: [],
      openQuestions: [],
    };
  }

  identity(): BenchIdentity {
    return {
      backend: 'mame',
      controller: 'mock test source',
      processor: 'not asserted',
      bosch: null,
      software: null,
      checksum: null,
      resetTrace: null,
    };
  }

  provenance(): BenchProvenance {
    return this.sourceProvenance;
  }

  state(): GatewayState {
    return this.current;
  }

  control(command: GatewayControl, _signal: AbortSignal): void {
    this.commands.push(command);
  }

  subscribe(listener: (state: GatewayState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

const start = async (source: GatewaySource): Promise<{
  baseUrl: string;
  close(): Promise<void>;
}> => {
  const server = createHttpGateway({
    htmlPath: fileURLToPath(new URL('../shell.html', import.meta.url)),
    source,
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => (error === undefined ? resolve() : reject(error)));
      server.closeAllConnections();
    }),
  };
};

describe('MAME HTTP gateway', () => {
  it('serves HTML, metadata, state, SSE, and writable demo controls', async (context) => {
    const source = new MockSource('demo');
    const gateway = await start(source);
    context.after(() => gateway.close());

    const html = await fetch(`${gateway.baseUrl}/`).then((response) => response.text());
    assert.match(html, /<!doctype html>/);

    const mode = await fetch(`${gateway.baseUrl}/api/mode`).then((response) => response.json());
    assert.deepEqual(mode, {
      schema: 'motronic.gateway.mode/v1',
      backend: 'mame',
      mode: 'demo',
      controls: 'read-write',
    });

    const provenance = (await fetch(`${gateway.baseUrl}/api/provenance`).then((response) =>
      response.json(),
    )) as GatewayProvenance;
    assert.equal(provenance.provenance.qualification, 'mock test source; no MAME fact claim');

    const state = (await fetch(`${gateway.baseUrl}/api/state`).then((response) =>
      response.json(),
    )) as GatewayState;
    assert.equal(state.sequence, 7);
    assert.equal(state.snapshot.availability.memory, false);

    const stream = await fetch(`${gateway.baseUrl}/api/events`);
    const reader = stream.body?.getReader();
    assert.ok(reader);
    const first = await reader.read();
    assert.match(new TextDecoder().decode(first.value), /event: state/);
    await reader.cancel();

    const control = await fetch(`${gateway.baseUrl}/api/controls`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ control: 'throttle', value: 0.4 }),
    });
    assert.equal(control.status, 202);
    assert.deepEqual(source.commands, [{ control: 'throttle', value: 0.4 }]);
  });

  it('rejects controls when the source declares evidence mode', async (context) => {
    const source = new MockSource('evidence');
    const gateway = await start(source);
    context.after(() => gateway.close());
    const response = await fetch(`${gateway.baseUrl}/api/controls`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ control: 'running', value: true }),
    });
    assert.equal(response.status, 403);
    assert.deepEqual(source.commands, []);
  });
});
