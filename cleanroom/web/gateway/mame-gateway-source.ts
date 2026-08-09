import { advanceLiveBench } from '../../../ecu/mame-sab80c535-lab/workstreams/signals-engine-plant/src/advance-live-bench.ts';
import { launchMameRuntime } from '../../../ecu/mame-sab80c535-lab/workstreams/signals-engine-plant/src/launch-mame-runtime.ts';
import type { RuntimeBridgeTypes } from '../../../ecu/mame-sab80c535-lab/workstreams/signals-engine-plant/src/runtime-bridge-types.ts';
import type {
  GatewayControl,
  GatewaySource,
  GatewayState,
} from './gateway-contract.ts';
import {
  appendMameTrace,
  mameIdentity,
  mameProvenance,
  mameSnapshot,
} from './mame-gateway-view.ts';

type Response = RuntimeBridgeTypes['response'];
type Frame = Extract<Response, { type: 'frame' }>;

export interface MameGatewayOptions {
  mode: 'demo' | 'evidence';
  mame: string;
  rom: string;
  runDirectory: string;
  socketPath: string;
}

export interface MameGatewaySource extends GatewaySource {
  dispose(): Promise<void>;
}

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export const createMameGatewaySource = async (
  options: MameGatewayOptions,
): Promise<MameGatewaySource> => {
  const session = await launchMameRuntime(options);
  const hello = await session.client.request({
    schema: 'motronic-bridge/v1',
    type: 'hello',
  });
  if (hello.type === 'error') {
    session.terminate();
    throw new Error(hello.message);
  }
  if (hello.type !== 'ready') {
    session.terminate();
    throw new Error('MAME bridge did not identify itself');
  }

  const identity = mameIdentity();
  const provenance = mameProvenance(options.mode, hello.romSha256, hello.mameCommit);
  const listeners = new Set<(state: GatewayState) => void>();
  let controls = { throttle: 0, brake: 0 };
  let sequence = 0;
  let bridgeSeq = hello.nextSeq;
  let liveState: ReturnType<typeof advanceLiveBench>['state'] | null = null;
  let previousFrame: Frame | null = null;
  let trace: GatewayState['trace'] = [];
  let running = false;
  let starterUntilStep = 0;
  let disposed = false;
  let pumping = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let current: GatewayState = {
    schema: 'motronic.gateway.state/v1',
    sequence,
    running,
    controls,
    snapshot: mameSnapshot(options.mode, 0, 0, null),
    trace,
  };

  const publish = (): void => {
    sequence += 1;
    current = { ...current, sequence, running, controls, trace };
    for (const listener of listeners) listener(current);
  };

  const schedule = (): void => {
    if (!running || disposed || timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      void pump();
    }, 10);
  };

  const pump = async (): Promise<void> => {
    if (!running || disposed || pumping || options.mode !== 'demo') return;
    pumping = true;
    try {
      const fromCycle = bridgeSeq * 10_000;
      const toCycle = fromCycle + 10_000;
      const plantStep = liveState?.plant.step ?? 0;
      if (
        liveState?.plant.rpmMilli === 0 &&
        controls.brake < 0.1 &&
        plantStep >= starterUntilStep
      ) {
        starterUntilStep = plantStep + 120;
      }
      const advanced = advanceLiveBench(
        liveState,
        {
          pedalPermille: Math.round(controls.throttle * 1_000),
          brakePermille: Math.round(controls.brake * 1_000),
          starterEngaged: plantStep < starterUntilStep,
          dropCrank: false,
          adcFault: null,
        },
        previousFrame,
        fromCycle,
        toCycle,
      );
      const response = await session.client.request({
        schema: 'motronic-bridge/v1',
        type: 'advance',
        seq: bridgeSeq,
        fromCycle,
        toCycle,
        events: advanced.events,
      });
      if (response.type === 'error') throw new Error(response.message);
      if (response.type !== 'frame') throw new Error('MAME bridge did not return a frame');
      bridgeSeq += 1;
      liveState = advanced.state;
      previousFrame = response;
      const machineMs = liveState.plant.step * 10;
      trace = appendMameTrace(trace, advanced.events, response.telemetry, machineMs);
      current = {
        ...current,
        snapshot: mameSnapshot(
          options.mode,
          machineMs,
          liveState.plant.rpmMilli,
          response.counters,
        ),
      };
      publish();
    } catch (error: unknown) {
      running = false;
      const message = error instanceof Error ? error.message : String(error);
      const diagnostics = session
        .output()
        .split('\n')
        .filter(
          (line) =>
            line.includes('UNKNOWN read') ||
            line.includes('Motronic bridge fatal') ||
            line.includes('XSUMMARY') ||
            line.includes('ESUMMARY'),
        )
        .slice(-4)
        .join(' | ');
      current = {
        ...current,
        snapshot: {
          ...current.snapshot,
          mode: `MAME runtime unavailable: ${message}${diagnostics ? ` · ${diagnostics}` : ''}`,
          availability: {
            ...current.snapshot.availability,
            runtime: false,
          },
        },
      };
      publish();
    } finally {
      pumping = false;
      schedule();
    }
  };

  return {
    identity: () => identity,
    provenance: () => provenance,
    state: () => current,
    control: (command: GatewayControl, signal: AbortSignal): void => {
      if (signal.aborted) throw new Error('control aborted');
      if (options.mode === 'evidence') throw new Error('evidence mode is read-only');
      if (command.control === 'running') {
        if (command.value && !running) {
          starterUntilStep = (liveState?.plant.step ?? 0) + 120;
        }
        running = command.value;
        if (!running && timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
      } else {
        controls = { ...controls, [command.control]: command.value };
      }
      publish();
      if (running) void pump();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose: async () => {
      disposed = true;
      running = false;
      if (timer !== null) clearTimeout(timer);
      try {
        try {
          session.client.send({ schema: 'motronic-bridge/v1', type: 'shutdown' });
          await delay(25);
        } catch {
          // A timed-out or failed runtime has already closed its bridge.
        }
      } finally {
        session.terminate();
      }
    },
  };
};
