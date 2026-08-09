import type { RuntimeBridgeTypes } from './runtime-bridge-types.ts';
import { runtimeBridgeValidation as validation } from './runtime-bridge-validation.ts';
import { validateRuntimeBridgeCommand } from './validate-runtime-bridge-command.ts';
import { validateRuntimeBridgeResponse } from './validate-runtime-bridge-response.ts';

export const parseRuntimeBridgeLine = (
  line: string,
  direction: 'command' | 'response',
  context: RuntimeBridgeTypes['validationContext'] = {},
): RuntimeBridgeTypes['command'] | RuntimeBridgeTypes['response'] => {
  if (line.length === 0) throw new Error('runtime bridge line must not be empty');
  if (line.includes('\n') || line.includes('\r')) {
    throw new Error('runtime bridge input must contain exactly one line');
  }
  if (new TextEncoder().encode(line).byteLength > validation.maximumLineBytes) {
    throw new Error(`runtime bridge line exceeds ${validation.maximumLineBytes} bytes`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(line) as unknown;
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`runtime bridge line is not valid JSON: ${detail}`);
  }
  return direction === 'command'
    ? validateRuntimeBridgeCommand(parsed, context)
    : validateRuntimeBridgeResponse(parsed, context);
};
