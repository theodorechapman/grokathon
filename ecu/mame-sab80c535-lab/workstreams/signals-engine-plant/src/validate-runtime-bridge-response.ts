import type { RuntimeBridgeTypes } from './runtime-bridge-types.ts';
import { runtimeBridgeValidation as validation } from './runtime-bridge-validation.ts';
import { validateRuntimeBridgeTelemetryEvent } from './validate-runtime-bridge-telemetry-event.ts';

const validateReady = (response: Record<string, unknown>): void => {
  validation.exactKeys(
    response,
    ['schema', 'type', 'cycle', 'nextSeq', 'romSha256', 'mameCommit', 'limits'],
    [],
    'response',
  );
  validation.integer(response.cycle, 0, validation.maximumCycle, 'response.cycle');
  validation.integer(response.nextSeq, 0, validation.maximumCycle, 'response.nextSeq');
  validation.string(response.romSha256, 'response.romSha256', /^[0-9a-f]{64}$/);
  validation.string(response.mameCommit, 'response.mameCommit', /^[0-9a-f]{40}$/);
  const limits = validation.record(response.limits, 'response.limits');
  validation.exactKeys(
    limits,
    ['maxEvents', 'maxBatchCycles'],
    [],
    'response.limits',
  );
  validation.integer(
    limits.maxEvents,
    1,
    validation.maximumBatchEvents,
    'limits.maxEvents',
  );
  validation.integer(
    limits.maxBatchCycles,
    1,
    validation.maximumAdvanceCycles,
    'limits.maxBatchCycles',
  );
};

const validateCounters = (value: unknown): Record<string, unknown> => {
  const counters = validation.record(value, 'response.counters');
  const keys = [
    'instructions',
    'init',
    'supervisor',
    'foreground',
    'timer0',
    'timer1',
    'timer2',
    'capture',
    'vector0063',
    'vector006b',
    'unknownXdataReads',
  ] as const;
  validation.exactKeys(counters, keys, [], 'response.counters');
  for (const key of keys) {
    validation.integer(counters[key], 0, validation.maximumCycle, `response.counters.${key}`);
  }
  return counters;
};

const validateFrame = (
  response: Record<string, unknown>,
  context: RuntimeBridgeTypes['validationContext'],
): void => {
  validation.exactKeys(
    response,
    ['schema', 'type', 'seq', 'fromCycle', 'toCycle', 'cycle', 'telemetry', 'counters'],
    [],
    'response',
  );
  const seq = validation.integer(response.seq, 0, validation.maximumCycle, 'response.seq');
  const fromCycle = validation.integer(
    response.fromCycle,
    0,
    validation.maximumCycle,
    'response.fromCycle',
  );
  const toCycle = validation.integer(
    response.toCycle,
    1,
    validation.maximumCycle,
    'response.toCycle',
  );
  const cycle = validation.integer(
    response.cycle,
    1,
    validation.maximumCycle,
    'response.cycle',
  );
  if (toCycle <= fromCycle || toCycle - fromCycle > validation.maximumAdvanceCycles) {
    throw new Error('response frame has an invalid cycle window');
  }
  if (cycle !== toCycle) throw new Error('response cycle must equal toCycle');
  if (context.expectedSeq !== undefined && seq !== context.expectedSeq) {
    throw new Error(`response seq ${seq} does not equal expected ${context.expectedSeq}`);
  }
  if (
    context.expectedFromCycle !== undefined &&
    fromCycle !== context.expectedFromCycle
  ) {
    throw new Error('response frame creates a cycle gap or overlap');
  }

  validateCounters(response.counters);
  const telemetry = validation.array(response.telemetry, 'response.telemetry');
  let previousCycle = fromCycle;
  for (const rawEvent of telemetry) {
    const event = validateRuntimeBridgeTelemetryEvent(rawEvent);
    if (event.cycle < fromCycle || event.cycle > toCycle) {
      throw new Error(`telemetry cycle ${event.cycle} is outside [${fromCycle}, ${toCycle}]`);
    }
    if (event.cycle < previousCycle) {
      throw new Error('response.telemetry cycles must be nondecreasing');
    }
    previousCycle = event.cycle;
  }
};

const validateError = (response: Record<string, unknown>): void => {
  validation.exactKeys(
    response,
    ['schema', 'type', 'fatal', 'message'],
    [],
    'response',
  );
  if (validation.boolean(response.fatal, 'response.fatal') !== true) {
    throw new Error('response.fatal must be true');
  }
  validation.string(response.message, 'response.message');
};

export const validateRuntimeBridgeResponse = (
  value: unknown,
  context: RuntimeBridgeTypes['validationContext'] = {},
): RuntimeBridgeTypes['response'] => {
  const response = validation.record(value, 'response');
  if (response.schema !== validation.schema) {
    throw new Error(`response.schema must equal ${validation.schema}`);
  }
  const kind = validation.oneOf(
    response.type,
    ['ready', 'frame', 'error'] as const,
    'response.type',
  );
  if (kind === 'ready') validateReady(response);
  else if (kind === 'frame') validateFrame(response, context);
  else validateError(response);
  return response as RuntimeBridgeTypes['response'];
};
