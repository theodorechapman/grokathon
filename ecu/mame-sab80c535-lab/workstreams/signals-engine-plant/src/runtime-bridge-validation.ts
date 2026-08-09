const requireRecord = (value: unknown, path: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
};

const requireExactKeys = (
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
  path: string,
): void => {
  for (const key of required) {
    if (!Object.hasOwn(value, key)) throw new Error(`${path}.${key} is required`);
  }
  const permitted = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!permitted.has(key)) throw new Error(`${path}.${key} is not permitted`);
  }
};

const requireInteger = (
  value: unknown,
  minimum: number,
  maximum: number,
  path: string,
): number => {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error(`${path} must be an integer in ${minimum}..${maximum}`);
  }
  return value as number;
};

const requireString = (value: unknown, path: string, pattern?: RegExp): string => {
  if (typeof value !== 'string' || value.length === 0 || (pattern && !pattern.test(value))) {
    throw new Error(`${path} must be a valid non-empty string`);
  }
  return value;
};

const requireBoolean = (value: unknown, path: string): boolean => {
  if (typeof value !== 'boolean') throw new Error(`${path} must be boolean`);
  return value;
};

const requireOneOf = <T extends string | number>(
  value: unknown,
  choices: readonly T[],
  path: string,
): T => {
  if (!choices.includes(value as T)) {
    throw new Error(`${path} must be one of ${choices.join(', ')}`);
  }
  return value as T;
};

const requireArray = (value: unknown, path: string): unknown[] => {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  return value;
};

export const runtimeBridgeValidation = {
  schema: 'motronic-bridge/v1' as const,
  maximumCycle: Number.MAX_SAFE_INTEGER,
  maximumLineBytes: 1_048_576,
  maximumBatchEvents: 4_096,
  maximumAdvanceCycles: 12_000_000,
  record: requireRecord,
  exactKeys: requireExactKeys,
  integer: requireInteger,
  string: requireString,
  boolean: requireBoolean,
  oneOf: requireOneOf,
  array: requireArray,
};
