import type { RuntimeBridgeTypes } from './runtime-bridge-types.ts';
import { runtimeBridgeValidation as validation } from './runtime-bridge-validation.ts';

export const validateRuntimeBridgeInputEvent = (
  value: unknown,
): RuntimeBridgeTypes['inputEvent'] => {
  const event = validation.record(value, 'event');
  const kind = validation.oneOf(
    event.kind,
    ['xdata', 'adc', 'port', 'cc0'] as const,
    'event.kind',
  );
  validation.integer(event.cycle, 0, validation.maximumCycle, 'event.cycle');

  if (kind === 'xdata') {
    validation.exactKeys(event, ['cycle', 'kind', 'address', 'value'], [], 'event');
    validation.integer(event.address, 0xa000, 0xa0ff, 'event.address');
    validation.integer(event.value, 0, 0xff, 'event.value');
  } else if (kind === 'adc') {
    validation.exactKeys(event, ['cycle', 'kind', 'channel', 'value'], [], 'event');
    validation.integer(event.channel, 0, 7, 'event.channel');
    validation.integer(event.value, 0, 127, 'event.value');
  } else if (kind === 'port') {
    validation.exactKeys(event, ['cycle', 'kind', 'port', 'value'], [], 'event');
    validation.oneOf(event.port, [3, 5, 6] as const, 'event.port');
    validation.integer(event.value, 0, 0xff, 'event.value');
  } else {
    validation.exactKeys(event, ['cycle', 'kind', 'state'], [], 'event');
    validation.oneOf(event.state, [0, 1] as const, 'event.state');
  }

  return event as RuntimeBridgeTypes['inputEvent'];
};
