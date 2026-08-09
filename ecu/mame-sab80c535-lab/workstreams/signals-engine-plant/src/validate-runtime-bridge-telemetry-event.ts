import type { RuntimeBridgeTypes } from './runtime-bridge-types.ts';
import { runtimeBridgeValidation as validation } from './runtime-bridge-validation.ts';

export const validateRuntimeBridgeTelemetryEvent = (
  value: unknown,
): RuntimeBridgeTypes['telemetryEvent'] => {
  const event = validation.record(value, 'telemetry');
  const kind = validation.oneOf(
    event.kind,
    ['p1', 'sfr-write', 'xdata-write'] as const,
    'telemetry.kind',
  );
  validation.integer(event.cycle, 0, validation.maximumCycle, 'telemetry.cycle');

  if (kind === 'p1') {
    validation.exactKeys(event, ['cycle', 'kind', 'bit', 'state'], [], 'telemetry');
    validation.oneOf(event.bit, [2, 3, 5, 7] as const, 'telemetry.bit');
    validation.oneOf(event.state, [0, 1] as const, 'telemetry.state');
  } else if (kind === 'sfr-write') {
    validation.exactKeys(event, ['cycle', 'kind', 'address', 'value'], [], 'telemetry');
    validation.integer(event.address, 0x80, 0xff, 'telemetry.address');
    validation.integer(event.value, 0, 0xff, 'telemetry.value');
  } else {
    validation.exactKeys(event, ['cycle', 'kind', 'address', 'value'], [], 'telemetry');
    validation.integer(event.address, 0, 0xffff, 'telemetry.address');
    validation.integer(event.value, 0, 0xff, 'telemetry.value');
  }

  return event as RuntimeBridgeTypes['telemetryEvent'];
};
