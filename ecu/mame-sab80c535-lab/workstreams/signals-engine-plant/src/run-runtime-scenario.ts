import { advanceLiveBench } from './advance-live-bench.ts';
import type { RuntimeBridgeTypes } from './runtime-bridge-types.ts';
import { runtimeScenarios } from './runtime-scenarios.ts';

type Command = RuntimeBridgeTypes['command'];
type Response = RuntimeBridgeTypes['response'];
type Frame = Extract<Response, { type: 'frame' }>;
type Scenario = (typeof runtimeScenarios)[number];

interface BridgeRequester {
  request(command: Command): Promise<Response>;
  send(command: Command): void;
}

interface RuntimeScenarioResult {
  scenarioId: Scenario['id'];
  status: 'passed' | 'blocked' | 'failed';
  detail: string;
  ready: Extract<Response, { type: 'ready' }>;
  commands: Command[];
  frames: Frame[];
  plantRpmMilli: number[];
}

const classify = (
  scenario: Scenario,
  frames: Frame[],
  rpm: number[],
): Pick<RuntimeScenarioResult, 'status' | 'detail'> => {
  const last = frames.at(-1);
  if (!last || frames.some((frame) => frame.counters.unknownXdataReads !== 0)) {
    return { status: 'failed', detail: 'unknown XDATA read or missing frame' };
  }
  if (scenario.id === 'stall' && (rpm.at(-1) ?? 1) !== 0) {
    return { status: 'failed', detail: 'demo plant did not reach stopped RPM' };
  }
  if (scenario.id !== 'stall' && Math.max(...rpm) <= 0) {
    return { status: 'failed', detail: 'demo plant never produced crank motion' };
  }
  if (!frames.some((frame) => frame.telemetry.some((event) => event.kind === 'sfr-write'))) {
    return { status: 'blocked', detail: 'CC2/CC3 schedule telemetry unavailable' };
  }
  if (!frames.some((frame) => frame.counters.supervisor > 0)) {
    return { status: 'blocked', detail: 'canonical firmware did not reach supervisor' };
  }
  if (!frames.some((frame) => frame.counters.foreground > 0)) {
    return {
      status: 'blocked',
      detail: 'canonical firmware did not sustain cyclic execution with synthetic geometry',
    };
  }
  return { status: 'passed', detail: 'all transport, plant, and canonical gates observed' };
};

export const runRuntimeScenario = async (
  client: BridgeRequester,
  scenario: Scenario,
): Promise<RuntimeScenarioResult> => {
  const commands: Command[] = [];
  const frames: Frame[] = [];
  const plantRpmMilli: number[] = [];
  const hello: Command = {
    schema: 'motronic-bridge/v1',
    type: 'hello',
  };
  commands.push(hello);
  const response = await client.request(hello);
  if (response.type === 'error') throw new Error(response.message);
  if (response.type !== 'ready') throw new Error('runtime bridge did not reply ready to hello');
  const ready = response;

  let state: ReturnType<typeof advanceLiveBench>['state'] | null = null;
  let previousFrame: Frame | null = null;
  for (let step = 0; step < scenario.steps; step += 1) {
    const fromCycle = step * 10_000;
    const toCycle = fromCycle + 10_000;
    const advanced = advanceLiveBench(
      state,
      scenario.inputAt(step),
      previousFrame,
      fromCycle,
      toCycle,
    );
    state = advanced.state;
    plantRpmMilli.push(state.plant.rpmMilli);
    const command: Command = {
      schema: 'motronic-bridge/v1',
      type: 'advance',
      seq: step,
      fromCycle,
      toCycle,
      events: advanced.events,
    };
    commands.push(command);
    const next = await client.request(command);
    if (next.type === 'error') throw new Error(next.message);
    if (next.type !== 'frame') throw new Error('runtime bridge did not reply with a frame');
    frames.push(next);
    previousFrame = next;
  }
  const shutdown: Command = {
    schema: 'motronic-bridge/v1',
    type: 'shutdown',
  };
  commands.push(shutdown);
  client.send(shutdown);
  return {
    scenarioId: scenario.id,
    ...classify(scenario, frames, plantRpmMilli),
    ready,
    commands,
    frames,
    plantRpmMilli,
  };
};
