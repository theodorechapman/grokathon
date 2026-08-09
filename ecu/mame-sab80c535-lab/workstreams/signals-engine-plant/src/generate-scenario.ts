import { assumptions } from './assumptions.ts';
import { createPrng } from './create-prng.ts';
import { oracleHooks } from './oracle-hooks.ts';
import { quantizeByte } from './quantize-byte.ts';
import {
  SIGNAL_SCHEMA,
  type BoardStatus,
  type ByteVector,
  type DigitalPorts,
  type InputKeyframe,
  type ScenarioSpec,
  type SignalContract,
} from './signal-contract.ts';

const SAMPLE_TICKS = 100;
const TICKS_PER_SECOND = 10_000;

const boundsAt = (
  keyframes: InputKeyframe[],
  tick: number,
): [InputKeyframe, InputKeyframe] => {
  const upperIndex = keyframes.findIndex((frame) => frame.tick >= tick);
  if (upperIndex <= 0) return [keyframes[0]!, keyframes[0]!];
  if (upperIndex < 0) return [keyframes.at(-1)!, keyframes.at(-1)!];
  return [keyframes[upperIndex - 1]!, keyframes[upperIndex]!];
};

const fractionAt = (lower: InputKeyframe, upper: InputKeyframe, tick: number): number =>
  upper.tick === lower.tick ? 0 : (tick - lower.tick) / (upper.tick - lower.tick);

const interpolateAdc = (
  lower: InputKeyframe,
  upper: InputKeyframe,
  tick: number,
  noise: (amplitude: number) => number,
  amplitude: number,
): ByteVector => {
  const fraction = fractionAt(lower, upper, tick);
  return lower.adc.map((value, channel) =>
    quantizeByte(value + (upper.adc[channel]! - value) * fraction + noise(amplitude)),
  ) as ByteVector;
};

const heldBoard = (frame: InputKeyframe): BoardStatus => ({
  ...(frame.boardStatus ?? { a040: 0, a041: 0, a081: 0 }),
});

const heldPorts = (frame: InputKeyframe): DigitalPorts => ({
  ...(frame.digitalPorts ?? { p3: 0xff, p5: 0xff, p6: 0xff }),
});

const periodAt = (keyframes: InputKeyframe[], tick: number): number => {
  const [lower, upper] = boundsAt(keyframes, tick);
  if (lower.crankPeriodTicks === 0 || upper.crankPeriodTicks === 0) {
    return tick < upper.tick ? lower.crankPeriodTicks : upper.crankPeriodTicks;
  }
  const fraction = fractionAt(lower, upper, tick);
  return Math.max(
    1,
    Math.floor(
      lower.crankPeriodTicks +
        (upper.crankPeriodTicks - lower.crankPeriodTicks) * fraction +
        0.5,
    ),
  );
};

const makeEdges = (spec: ScenarioSpec): SignalContract['crankEdges'] => {
  const edges: SignalContract['crankEdges'] = [];
  let elapsed = 0;
  for (let tick = 0; tick <= spec.durationTicks; tick += 1) {
    const period = periodAt(spec.keyframes, tick);
    if (period === 0) {
      elapsed = 0;
      continue;
    }
    elapsed += 1;
    if (elapsed < period) continue;
    edges.push({ tick, endpoint: 'external-3/CC0', edge: 'falling' });
    elapsed = 0;
  }
  return edges;
};

const assertSpec = (spec: ScenarioSpec): void => {
  if (spec.keyframes.length < 2) throw new Error(`${spec.id}: at least two keyframes required`);
  if (spec.keyframes[0]!.tick !== 0) throw new Error(`${spec.id}: first keyframe must be tick 0`);
  if (spec.keyframes.at(-1)!.tick !== spec.durationTicks) {
    throw new Error(`${spec.id}: final keyframe must equal duration`);
  }
  for (let index = 1; index < spec.keyframes.length; index += 1) {
    if (spec.keyframes[index - 1]!.tick >= spec.keyframes[index]!.tick) {
      throw new Error(`${spec.id}: keyframe ticks must increase`);
    }
  }
};

export const generateScenario = (spec: ScenarioSpec, seed = spec.seed): SignalContract => {
  assertSpec(spec);
  const prng = createPrng(seed);
  const frames: SignalContract['frames'] = [];
  for (let tick = 0; tick <= spec.durationTicks; tick += SAMPLE_TICKS) {
    const [lower, upper] = boundsAt(spec.keyframes, tick);
    frames.push({
      tick,
      boardStatus: heldBoard(lower),
      adc: interpolateAdc(lower, upper, tick, prng.nextSigned, spec.noiseAmplitude),
      digitalPorts: heldPorts(lower),
    });
  }
  const selectedAssumptions = assumptions.filter(
    (item) =>
      item.id !== 'sensor-extreme-fixtures' || spec.assumptionIds?.includes(item.id) === true,
  );
  return {
    schema: SIGNAL_SCHEMA,
    id: spec.id,
    title: spec.title,
    seed: seed >>> 0,
    qualification:
      'Deterministic bench stimulus and logical observation hooks; not an engine, vehicle, electrical, or physical-unit model.',
    timebase: {
      ticksPerSecond: TICKS_PER_SECOND,
      unit: 'bench-tick',
      sampleEveryTicks: SAMPLE_TICKS,
      interpolation: 'linear-then-nearest',
      byteQuantization: 'nearest-ties-up-saturate-u8',
    },
    durationTicks: spec.durationTicks,
    assumptions: selectedAssumptions.map((item) => ({
      ...item,
      sources: [...item.sources],
      excludes: [...item.excludes],
    })),
    frames,
    crankEdges: makeEdges(spec),
    diagnosticBytes: spec.diagnosticBytes?.map((event) => ({ ...event })) ?? [],
    oracleHooks: oracleHooks.map((hook) => ({ ...hook })),
  };
};
