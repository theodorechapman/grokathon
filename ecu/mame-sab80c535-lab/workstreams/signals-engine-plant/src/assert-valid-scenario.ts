import { SIGNAL_SCHEMA, type SignalContract } from './signal-contract.ts';

const assertByte = (value: number, path: string): void => {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new Error(`${path} must be an unsigned byte`);
  }
};

const assertTicks = (ticks: number[], duration: number, path: string): void => {
  let previous = -1;
  for (const tick of ticks) {
    if (!Number.isInteger(tick) || tick < 0 || tick > duration) {
      throw new Error(`${path} tick ${tick} is outside 0..${duration}`);
    }
    if (tick <= previous) throw new Error(`${path} ticks must increase`);
    previous = tick;
  }
};

export const assertValidScenario = (scenario: SignalContract): void => {
  if (scenario.schema !== SIGNAL_SCHEMA) throw new Error(`unsupported schema: ${scenario.schema}`);
  if (!scenario.id) throw new Error('scenario id is required');
  if (!Number.isInteger(scenario.seed) || scenario.seed < 0 || scenario.seed > 0xffff_ffff) {
    throw new Error('seed must be uint32');
  }
  if (scenario.durationTicks <= 0 || !Number.isInteger(scenario.durationTicks)) {
    throw new Error('durationTicks must be a positive integer');
  }
  if (scenario.frames.length < 2) throw new Error('at least two frames are required');
  assertTicks(
    scenario.frames.map((frame) => frame.tick),
    scenario.durationTicks,
    'frames',
  );
  if (scenario.frames[0]!.tick !== 0) throw new Error('first frame must start at zero');
  if (scenario.frames.at(-1)!.tick !== scenario.durationTicks) {
    throw new Error('last frame must equal durationTicks');
  }
  for (const [index, frame] of scenario.frames.entries()) {
    frame.adc.forEach((value, channel) =>
      assertByte(value, `frames[${index}].adc[${channel}]`),
    );
    assertByte(frame.boardStatus.a040, `frames[${index}].boardStatus.a040`);
    assertByte(frame.boardStatus.a041, `frames[${index}].boardStatus.a041`);
    assertByte(frame.boardStatus.a081, `frames[${index}].boardStatus.a081`);
    assertByte(frame.digitalPorts.p3, `frames[${index}].digitalPorts.p3`);
    assertByte(frame.digitalPorts.p5, `frames[${index}].digitalPorts.p5`);
    assertByte(frame.digitalPorts.p6, `frames[${index}].digitalPorts.p6`);
  }
  assertTicks(
    scenario.crankEdges.map((edge) => edge.tick),
    scenario.durationTicks,
    'crankEdges',
  );
  assertTicks(
    scenario.diagnosticBytes.map((event) => event.tick),
    scenario.durationTicks,
    'diagnosticBytes',
  );
  scenario.diagnosticBytes.forEach((event, index) =>
    assertByte(event.value, `diagnosticBytes[${index}].value`),
  );
  if (scenario.assumptions.some((item) => item.sources.length === 0)) {
    throw new Error('every assumption requires provenance');
  }
  const hookIds = scenario.oracleHooks.map((hook) => hook.id);
  if (new Set(hookIds).size !== hookIds.length) throw new Error('oracle hook ids must be unique');
};
