import type { RuntimeBridgeTypes } from './runtime-bridge-types.ts';
import { runtimeBridgeValidation as validation } from './runtime-bridge-validation.ts';
import { validateRuntimeBridgeInputEvent } from './validate-runtime-bridge-input-event.ts';

export const validateRuntimeBridgeCommand = (
  value: unknown,
  context: RuntimeBridgeTypes['validationContext'] = {},
): RuntimeBridgeTypes['command'] => {
  const command = validation.record(value, 'command');
  if (command.schema !== validation.schema) {
    throw new Error(`command.schema must equal ${validation.schema}`);
  }
  const kind = validation.oneOf(
    command.type,
    ['hello', 'advance', 'shutdown'] as const,
    'command.type',
  );

  if (kind === 'hello') {
    validation.exactKeys(command, ['schema', 'type'], [], 'command');
  } else if (kind === 'shutdown') {
    validation.exactKeys(command, ['schema', 'type'], [], 'command');
  } else {
    validation.exactKeys(
      command,
      ['schema', 'type', 'seq', 'fromCycle', 'toCycle', 'events'],
      [],
      'command',
    );
    const seq = validation.integer(command.seq, 0, validation.maximumCycle, 'command.seq');
    const fromCycle = validation.integer(
      command.fromCycle,
      0,
      validation.maximumCycle,
      'command.fromCycle',
    );
    const toCycle = validation.integer(
      command.toCycle,
      1,
      validation.maximumCycle,
      'command.toCycle',
    );
    if (toCycle <= fromCycle) throw new Error('advance cycle window must move forward');
    if (toCycle - fromCycle > validation.maximumAdvanceCycles) {
      throw new Error(`advance exceeds ${validation.maximumAdvanceCycles} cycles`);
    }
    if (context.expectedSeq !== undefined && seq !== context.expectedSeq) {
      throw new Error(`advance seq ${seq} does not equal expected ${context.expectedSeq}`);
    }
    if (
      context.expectedFromCycle !== undefined &&
      fromCycle !== context.expectedFromCycle
    ) {
      throw new Error(
        `advance fromCycle ${fromCycle} creates a gap or overlap at ${context.expectedFromCycle}`,
      );
    }

    const events = validation.array(command.events, 'command.events');
    if (events.length > validation.maximumBatchEvents) {
      throw new Error(`command.events exceeds ${validation.maximumBatchEvents} entries`);
    }
    let previousCycle = -1;
    for (const rawEvent of events) {
      const event = validateRuntimeBridgeInputEvent(rawEvent);
      if (event.cycle < fromCycle || event.cycle >= toCycle) {
        throw new Error(`event cycle ${event.cycle} is outside [${fromCycle}, ${toCycle})`);
      }
      if (event.cycle < previousCycle) {
        throw new Error('command.events cycles must be nondecreasing');
      }
      previousCycle = event.cycle;
    }
  }

  return command as RuntimeBridgeTypes['command'];
};
