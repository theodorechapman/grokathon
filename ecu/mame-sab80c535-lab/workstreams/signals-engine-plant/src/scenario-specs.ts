import type {
  BoardStatus,
  ByteVector,
  DigitalPorts,
  InputKeyframe,
  ScenarioSpec,
} from './signal-contract.ts';

const STATUS: BoardStatus = { a040: 0x00, a041: 0x00, a081: 0x00 };
const PORTS: DigitalPorts = { p3: 0xff, p5: 0xff, p6: 0xff };

const key = (
  tick: number,
  adc: ByteVector,
  crankPeriodTicks: number,
): InputKeyframe => ({
  tick,
  adc,
  boardStatus: { ...STATUS },
  digitalPorts: { ...PORTS },
  crankPeriodTicks,
});

export const scenarioSpecs: ReadonlyArray<ScenarioSpec> = [
  {
    id: 'key-on',
    title: 'Key-on, no crank source',
    seed: 0x10010001,
    durationTicks: 3000,
    noiseAmplitude: 0,
    keyframes: [
      key(0, [0x20, 0x80, 0x80, 0x80, 0x80, 0x80, 0, 0], 0),
      key(3000, [0x90, 0x80, 0x80, 0x80, 0x80, 0x80, 0, 0], 0),
    ],
    diagnosticBytes: [{ tick: 2200, endpoint: 'UART/RXD', value: 0x06 }],
  },
  {
    id: 'cold-crank',
    title: 'Cold-like codes with slow crank edges',
    seed: 0x10020002,
    durationTicks: 7000,
    noiseAmplitude: 1,
    keyframes: [
      key(0, [0x24, 0xc8, 0xdc, 0x80, 0x80, 0x80, 0, 0], 0),
      key(800, [0x30, 0xc8, 0xdc, 0x80, 0x80, 0x80, 0, 0], 300),
      key(7000, [0x58, 0xc0, 0xd0, 0x80, 0x80, 0x80, 0, 0], 220),
    ],
  },
  {
    id: 'warm-idle',
    title: 'Warm-like steady idle fixture',
    seed: 0x10030003,
    durationTicks: 8000,
    noiseAmplitude: 1,
    keyframes: [
      key(0, [0x28, 0x70, 0x68, 0x80, 0x80, 0x80, 0, 0], 0),
      key(600, [0x38, 0x70, 0x68, 0x80, 0x80, 0x80, 0, 0], 126),
      key(8000, [0x3a, 0x70, 0x68, 0x80, 0x80, 0x80, 0, 0], 122),
    ],
  },
  {
    id: 'part-load-ramp',
    title: 'Part-load-like ADC and edge ramp',
    seed: 0x10040004,
    durationTicks: 9000,
    noiseAmplitude: 1,
    keyframes: [
      key(0, [0x38, 0x74, 0x70, 0x80, 0x80, 0x80, 0, 0], 125),
      key(3000, [0x68, 0x74, 0x70, 0x88, 0x80, 0x80, 0, 0], 85),
      key(6000, [0x9c, 0x74, 0x70, 0x90, 0x80, 0x80, 0, 0], 58),
      key(9000, [0xc0, 0x74, 0x70, 0x98, 0x80, 0x80, 0, 0], 44),
    ],
  },
  {
    id: 'wide-open-throttle',
    title: 'Byte-saturated load-like fixture',
    seed: 0x10050005,
    durationTicks: 7000,
    noiseAmplitude: 1,
    keyframes: [
      key(0, [0xb0, 0x74, 0x70, 0x98, 0x80, 0x80, 0, 0], 48),
      key(2000, [0xf0, 0x74, 0x70, 0xb0, 0x80, 0x80, 0, 0], 38),
      key(7000, [0xff, 0x74, 0x70, 0xc0, 0x80, 0x80, 0, 0], 34),
    ],
  },
  {
    id: 'overrun',
    title: 'Fast edges with falling load-like code',
    seed: 0x10060006,
    durationTicks: 8000,
    noiseAmplitude: 1,
    keyframes: [
      key(0, [0xd0, 0x74, 0x70, 0x98, 0x80, 0x80, 0, 0], 38),
      key(1500, [0x20, 0x74, 0x70, 0x50, 0x80, 0x80, 0, 0], 40),
      key(8000, [0x10, 0x74, 0x70, 0x30, 0x80, 0x80, 0, 0], 78),
    ],
  },
  {
    id: 'stall',
    title: 'Crank-edge cessation fixture',
    seed: 0x10070007,
    durationTicks: 7000,
    noiseAmplitude: 0,
    keyframes: [
      key(0, [0x48, 0x78, 0x74, 0x80, 0x80, 0x80, 0, 0], 110),
      key(3000, [0x30, 0x78, 0x74, 0x78, 0x80, 0x80, 0, 0], 180),
      key(3600, [0x28, 0x78, 0x74, 0x70, 0x80, 0x80, 0, 0], 0),
      key(7000, [0x20, 0x78, 0x74, 0x70, 0x80, 0x80, 0, 0], 0),
    ],
  },
  {
    id: 'sensor-ch1-high',
    title: 'ADC channel 1 held at byte maximum',
    seed: 0x10080008,
    durationTicks: 6000,
    noiseAmplitude: 0,
    assumptionIds: ['sensor-extreme-fixtures'],
    keyframes: [
      key(0, [0x48, 0xff, 0x70, 0x80, 0x80, 0x80, 0, 0], 120),
      key(6000, [0x48, 0xff, 0x70, 0x80, 0x80, 0x80, 0, 0], 120),
    ],
  },
  {
    id: 'sensor-ch2-low',
    title: 'ADC channel 2 held at byte minimum',
    seed: 0x10090009,
    durationTicks: 6000,
    noiseAmplitude: 0,
    assumptionIds: ['sensor-extreme-fixtures'],
    keyframes: [
      key(0, [0x48, 0x70, 0x00, 0x80, 0x80, 0x80, 0, 0], 120),
      key(6000, [0x48, 0x70, 0x00, 0x80, 0x80, 0x80, 0, 0], 120),
    ],
  },
  {
    id: 'sensor-ch0-stuck-high',
    title: 'ADC channel 0 held high through edge ramp',
    seed: 0x100a000a,
    durationTicks: 6000,
    noiseAmplitude: 0,
    assumptionIds: ['sensor-extreme-fixtures'],
    keyframes: [
      key(0, [0xf0, 0x70, 0x70, 0x80, 0x80, 0x80, 0, 0], 120),
      key(6000, [0xf0, 0x70, 0x70, 0x80, 0x80, 0x80, 0, 0], 55),
    ],
  },
];
