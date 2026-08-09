import { createConnection, type Socket } from 'node:net';

import { parseRuntimeBridgeLine } from './parse-runtime-bridge-line.ts';
import type { RuntimeBridgeTypes } from './runtime-bridge-types.ts';
import { validateRuntimeBridgeCommand } from './validate-runtime-bridge-command.ts';

type Command = RuntimeBridgeTypes['command'];
type Response = RuntimeBridgeTypes['response'];
type Context = RuntimeBridgeTypes['validationContext'];

interface RuntimeBridgeClient {
  request(command: Command): Promise<Response>;
  send(command: Command): void;
  close(): void;
}

interface PendingResponse {
  context: Context;
  resolve(response: Response): void;
  reject(error: Error): void;
  timeout: ReturnType<typeof setTimeout>;
}

const connectSocket = (path: string, timeoutMs: number): Promise<Socket> =>
  new Promise((resolve, reject) => {
    const socket = createConnection(path);
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error(`runtime bridge connect timed out after ${timeoutMs} ms`));
    }, timeoutMs);
    socket.on('connect', () => {
      clearTimeout(timeout);
      resolve(socket);
    });
    socket.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

const responseContext = (command: Command): Context =>
  command.type === 'advance'
    ? { expectedSeq: command.seq, expectedFromCycle: command.fromCycle }
    : {};

export const connectRuntimeBridge = async (
  path: string,
  timeoutMs = 5_000,
): Promise<RuntimeBridgeClient> => {
  if (path.length === 0) throw new Error('runtime bridge socket path must not be empty');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error('runtime bridge timeout must be a positive integer');
  }
  const socket = await connectSocket(path, timeoutMs);
  socket.setEncoding('utf8');
  let buffer = '';
  let pending: PendingResponse | null = null;
  let closed = false;

  const failPending = (error: Error): void => {
    if (pending === null) return;
    clearTimeout(pending.timeout);
    const reject = pending.reject;
    pending = null;
    reject(error);
  };

  socket.on('data', (data) => {
    buffer += data;
    while (buffer.includes('\n')) {
      const boundary = buffer.indexOf('\n');
      const line = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 1);
      if (pending === null) {
        socket.destroy(new Error('runtime bridge sent an unsolicited response'));
        return;
      }
      try {
        const response = parseRuntimeBridgeLine(
          line,
          'response',
          pending.context,
        ) as Response;
        clearTimeout(pending.timeout);
        const resolve = pending.resolve;
        pending = null;
        resolve(response);
      } catch (error: unknown) {
        socket.destroy(error instanceof Error ? error : new Error(String(error)));
        return;
      }
    }
  });
  socket.on('error', (error) => failPending(error));
  socket.on('close', () => {
    closed = true;
    failPending(new Error('runtime bridge disconnected'));
  });

  return {
    request: (command) => {
      if (closed) return Promise.reject(new Error('runtime bridge is closed'));
      if (pending !== null) return Promise.reject(new Error('runtime bridge request already pending'));
      const validated = validateRuntimeBridgeCommand(command);
      return new Promise<Response>((resolve, reject) => {
        const timeout = setTimeout(() => {
          socket.destroy();
          reject(new Error(`runtime bridge response timed out after ${timeoutMs} ms`));
        }, timeoutMs);
        pending = {
          context: responseContext(validated),
          resolve,
          reject,
          timeout,
        };
        socket.write(`${JSON.stringify(validated)}\n`);
      });
    },
    send: (command) => {
      if (closed) throw new Error('runtime bridge is closed');
      if (pending !== null) throw new Error('runtime bridge request already pending');
      const validated = validateRuntimeBridgeCommand(command);
      socket.write(`${JSON.stringify(validated)}\n`);
    },
    close: () => {
      closed = true;
      socket.end();
    },
  };
};
