declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  pid: number;
  exitCode?: number;
  stdout: { write(value: string): void };
  stderr: { write(value: string): void };
};

declare module 'node:assert' {
  export const strict: {
    deepEqual(actual: unknown, expected: unknown): void;
    doesNotThrow(callback: () => unknown): void;
    equal(actual: unknown, expected: unknown): void;
    match(actual: string, expected: RegExp): void;
    notDeepEqual(actual: unknown, expected: unknown): void;
    notEqual(actual: unknown, expected: unknown): void;
    ok(value: unknown): asserts value;
    throws(callback: () => unknown, expected?: RegExp): void;
  };
}

declare module 'node:child_process' {
  interface TextStream {
    setEncoding(encoding: string): void;
    on(event: 'data', listener: (data: string) => void): void;
  }

  interface ChildProcess {
    stdout: TextStream;
    stderr: TextStream;
    kill(signal?: string): void;
    on(event: 'error', listener: (error: Error) => void): void;
    on(
      event: 'exit',
      listener: (code: number | null, signal: string | null) => void,
    ): void;
  }

  export function spawn(
    command: string,
    args: readonly string[],
    options: {
      cwd?: string;
      env?: Record<string, string | undefined>;
      stdio: readonly ['ignore', 'pipe', 'pipe'];
    },
  ): ChildProcess;
}

declare module 'node:crypto' {
  interface Hash {
    update(value: string | Uint8Array): Hash;
    digest(encoding: 'hex'): string;
  }
  export function createHash(algorithm: string): Hash;
}

declare module 'node:fs' {
  export function existsSync(path: string): boolean;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
  export function readFileSync(path: string | URL): Uint8Array;
  export function readFileSync(path: string | URL, encoding: 'utf8'): string;
  export function rmSync(
    path: string,
    options?: { force?: boolean; recursive?: boolean },
  ): void;
  export function symlinkSync(target: string, path: string): void;
  export function unlinkSync(path: string): void;
  export function writeFileSync(
    path: string | URL,
    data: string | Uint8Array,
    encoding?: 'utf8',
  ): void;
}

declare module 'node:net' {
  export interface Socket {
    setEncoding(encoding: string): void;
    write(value: string): void;
    end(): void;
    destroy(error?: Error): void;
    on(event: 'connect', listener: () => void): this;
    on(event: 'data', listener: (data: string) => void): this;
    on(event: 'error', listener: (error: Error) => void): this;
    on(event: 'close', listener: () => void): this;
  }
  export function createConnection(path: string): Socket;
}

declare module 'node:path' {
  export function dirname(path: string): string;
  export function join(...paths: string[]): string;
  export function resolve(...paths: string[]): string;
}

declare module 'node:test' {
  interface TestContext {
    after(callback: () => void | Promise<void>): void;
  }
  type Test = (
    name: string,
    callback: (context: TestContext) => void | Promise<void>,
  ) => void;
  export const describe: Test;
  export const it: Test;
}

declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string;
}
