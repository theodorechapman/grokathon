import { advanceDemoPlant } from './advance-demo-plant.ts';
import { demoPlantConstants } from './demo-plant-constants.ts';
import type { RuntimeBridgeTypes } from './runtime-bridge-types.ts';
import { scheduleNextCrankPulse } from './schedule-next-crank-pulse.ts';
import { syntheticCrankGeometry } from './synthetic-crank-geometry.ts';

type InputEvent = RuntimeBridgeTypes['inputEvent'];
type Frame = Extract<RuntimeBridgeTypes['response'], { type: 'frame' }>;
type PlantState = ReturnType<typeof advanceDemoPlant>;
type CrankState = ReturnType<typeof scheduleNextCrankPulse>['state'];

interface LiveBenchInput {
  pedalPermille: number;
  brakePermille: number;
  starterEngaged: boolean;
  dropCrank: boolean;
  adcFault: { channel: number; callbackCode: number } | null;
}

interface LiveBenchState {
  plant: PlantState;
  crank: CrankState | null;
  injectorScheduleHoldSteps: number;
}

interface LiveBenchStep {
  state: LiveBenchState;
  events: InputEvent[];
}

const injectorScheduleObserved = (frame: Frame | null): boolean => {
  if (frame === null) return false;
  return frame.telemetry.some(
    (event) =>
      event.kind === 'sfr-write' &&
      (event.address === 0xc4 ||
        event.address === 0xc5 ||
        event.address === 0xc6 ||
        event.address === 0xc7),
  );
};

const baseInputs = (
  cycle: number,
  afmCallbackCode: number,
  fault: LiveBenchInput['adcFault'],
): InputEvent[] => {
  const adc = [afmCallbackCode, 100, 58, 44, 56, 64, 64, 64];
  if (fault !== null) {
    if (!Number.isInteger(fault.channel) || fault.channel < 0 || fault.channel > 7) {
      throw new Error('adcFault.channel must be 0..7');
    }
    if (!Number.isInteger(fault.callbackCode) || fault.callbackCode < 0 || fault.callbackCode > 127) {
      throw new Error('adcFault.callbackCode must be 0..127');
    }
    adc[fault.channel] = fault.callbackCode;
  }
  return [
    { cycle, kind: 'xdata', address: 0xa040, value: 0x40 },
    { cycle, kind: 'xdata', address: 0xa041, value: 0 },
    { cycle, kind: 'xdata', address: 0xa081, value: 0 },
    ...adc.map(
      (value, channel): InputEvent => ({ cycle, kind: 'adc', channel, value }),
    ),
    { cycle, kind: 'port', port: 3, value: 0xff },
    { cycle, kind: 'port', port: 5, value: 0xff },
    { cycle, kind: 'port', port: 6, value: 0xff },
  ];
};

const eventOrder = (event: InputEvent): number => {
  if (event.kind === 'xdata') return 0;
  if (event.kind === 'adc') return 1;
  if (event.kind === 'port') return 2;
  return 3;
};

export const advanceLiveBench = (
  prior: LiveBenchState | null,
  input: LiveBenchInput,
  previousFrame: Frame | null,
  fromCycle: number,
  toCycle: number,
): LiveBenchStep => {
  if (!Number.isSafeInteger(fromCycle) || !Number.isSafeInteger(toCycle) || toCycle <= fromCycle) {
    throw new Error('live bench cycle window must move forward');
  }
  const observed = injectorScheduleObserved(previousFrame);
  const injectorScheduleHoldSteps =
    previousFrame === null
      ? 0
      : observed
        ? demoPlantConstants.injectorScheduleHoldSteps.value
        : Math.max(0, (prior?.injectorScheduleHoldSteps ?? 0) - 1);
  const plant = advanceDemoPlant(prior?.plant ?? null, {
    pedalPermille: input.pedalPermille,
    brakePermille: input.brakePermille,
    starterEngaged: input.starterEngaged,
    injectorScheduleActive:
      previousFrame === null ? null : injectorScheduleHoldSteps > 0,
  });
  let crank = prior?.crank ?? null;
  const events = baseInputs(fromCycle, plant.afmCallbackCode, input.adcFault);

  if (plant.rpmMilli === 0) {
    crank = null;
  } else {
    while (crank === null || crank.nextCycle < toCycle) {
      const scheduled = scheduleNextCrankPulse(
        crank,
        plant.rpmMilli,
        syntheticCrankGeometry.geometry,
        fromCycle,
      );
      crank = scheduled.state;
      if (!input.dropCrank) {
        events.push(
          ...scheduled.transitions.filter(
            (event) => event.cycle >= fromCycle && event.cycle < toCycle,
          ).map(
            (event): InputEvent => ({
              cycle: event.cycle,
              kind: 'cc0',
              state: event.level,
            }),
          ),
        );
      }
    }
  }

  events.sort((left, right) => left.cycle - right.cycle || eventOrder(left) - eventOrder(right));
  return { state: { plant, crank, injectorScheduleHoldSteps }, events };
};
