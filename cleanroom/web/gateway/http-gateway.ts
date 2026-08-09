import { readFileSync } from 'node:fs';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';

import type {
  GatewayControl,
  GatewayMode,
  GatewayProvenance,
  GatewaySource,
  GatewayState,
} from './gateway-contract.ts';

export interface HttpGatewayOptions {
  htmlPath: string;
  source: GatewaySource;
  controlTimeoutMs?: number;
}

class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const sendJson = (response: ServerResponse, status: number, value: unknown): void => {
  response
    .writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    })
    .end(`${JSON.stringify(value)}\n`);
};

const readJson = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > 16_384) throw new HttpError(413, 'control request exceeds 16 KiB');
    chunks.push(bytes);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new HttpError(400, 'control body must be valid JSON');
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readControl = (value: unknown): GatewayControl => {
  if (!isRecord(value) || typeof value.control !== 'string') {
    throw new HttpError(400, 'control body needs control and value');
  }
  if (value.control === 'running' && typeof value.value === 'boolean') {
    return { control: 'running', value: value.value };
  }
  if (
    (value.control === 'throttle' || value.control === 'brake') &&
    typeof value.value === 'number' &&
    Number.isFinite(value.value) &&
    value.value >= 0 &&
    value.value <= 1
  ) {
    return { control: value.control, value: value.value };
  }
  throw new HttpError(400, 'unsupported control or value');
};

const sendStateEvent = (response: ServerResponse, state: GatewayState): void => {
  response.write(`id: ${state.sequence}\nevent: state\ndata: ${JSON.stringify(state)}\n\n`);
};

const awaitControl = async (
  source: GatewaySource,
  control: GatewayControl,
  timeoutMs: number,
): Promise<void> => {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new HttpError(504, `control timed out after ${timeoutMs} ms`));
    }, timeoutMs);
  });
  try {
    await Promise.race([
      Promise.resolve().then(() => source.control(control, controller.signal)),
      timeout,
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};

export const createHttpGateway = (options: HttpGatewayOptions): Server => {
  const html = readFileSync(options.htmlPath);
  const source = options.source;
  const timeoutMs = options.controlTimeoutMs ?? 3_000;

  const route = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const method = request.method ?? 'GET';
    const url = new URL(request.url ?? '/', 'http://gateway.invalid');
    const path = url.pathname;
    if (method === 'GET' && (path === '/' || path === '/motronic-bench.html')) {
      if (url.searchParams.get('backend') !== 'mame') {
        response.writeHead(302, { location: '/?backend=mame' }).end();
        return;
      }
      response
        .writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
        })
        .end(html);
      return;
    }
    if (method === 'GET' && path === '/favicon.ico') {
      response.writeHead(204).end();
      return;
    }
    if (method === 'GET' && path === '/api/mode') {
      const provenance = source.provenance();
      const mode: GatewayMode = {
        schema: 'motronic.gateway.mode/v1',
        backend: 'mame',
        mode: provenance.mode,
        controls: provenance.controls,
      };
      sendJson(response, 200, mode);
      return;
    }
    if (method === 'GET' && path === '/api/provenance') {
      const provenance: GatewayProvenance = {
        schema: 'motronic.gateway.provenance/v1',
        identity: source.identity(),
        provenance: source.provenance(),
      };
      sendJson(response, 200, provenance);
      return;
    }
    if (method === 'GET' && path === '/api/state') {
      sendJson(response, 200, source.state());
      return;
    }
    if (method === 'GET' && path === '/api/events') {
      response.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
      });
      sendStateEvent(response, source.state());
      const unsubscribe = source.subscribe((state) => sendStateEvent(response, state));
      request.once('close', unsubscribe);
      return;
    }
    if (method === 'POST' && path === '/api/controls') {
      const provenance = source.provenance();
      if (provenance.mode === 'evidence' || provenance.controls === 'read-only') {
        throw new HttpError(403, 'controls are read-only in evidence mode');
      }
      const control = readControl(await readJson(request));
      await awaitControl(source, control, timeoutMs);
      sendJson(response, 202, { accepted: true });
      return;
    }
    throw new HttpError(404, 'not found');
  };

  return createServer((request, response) => {
    void route(request, response).catch((error: unknown) => {
      const status = error instanceof HttpError ? error.status : 500;
      const message = error instanceof Error ? error.message : String(error);
      if (!response.headersSent) sendJson(response, status, { error: message });
      else response.destroy(error instanceof Error ? error : new Error(message));
    });
  });
};
