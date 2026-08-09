/**
 * Every calibration payload the specification locates, with its dimensions and
 * its master-directory slot.
 *
 * Addresses are quoted verbatim from SPECS and are the *payload* addresses the
 * XDF labels; a descriptor's axis header sits immediately before its payload,
 * which is why the image builder lays each table out backwards from here.
 *
 * Slot numbers marked `spec` are stated outright ("master slot 8 / payload
 * 488b", "slot 16 / variant 4931", "slots 18/20", "slot 19", "slot 25",
 * "slots 26/32"). The rest are model-assigned and carry no claim.
 *
 * `consumed: false` records a real finding: "Six XDF part-throttle maps have no
 * consumers in recovered selector configurations; that means unobserved, not
 * dead." They are in the directory and reachable, but no selector table points
 * at them.
 */

import { IDATA } from '../memory-map.ts';
import type { PayloadShape } from './payload-shapes.ts';

export interface PayloadEntry {
  payloadAddress: number;
  slot: number;
  slotProvenance: 'spec' | 'model';
  label: string;
  shape: PayloadShape;
  /** Axis input addresses, in descriptor order. */
  axes: Array<{ inputAddress: number; count: number }>;
  consumed: boolean;
  note?: string;
}

const SPEED = IDATA.encodedEngineSpeed;
const LOAD = IDATA.normalizedLoad;
const COOLANT = IDATA.coolantTemperature;
const AIR = IDATA.intakeAirTemperature;
const SUPPLY = IDATA.scaledSupplyVoltage;

export const PAYLOAD_CATALOG: readonly PayloadEntry[] = [
  // --- fuel corrections -----------------------------------------------------
  {
    payloadAddress: 0x488b,
    slot: 8,
    slotProvenance: 'spec',
    label: 'injector lag versus supply state',
    shape: 'injector-lag',
    axes: [{ inputAddress: SUPPLY, count: 16 }],
    consumed: true,
  },
  {
    payloadAddress: 0x4931,
    slot: 16,
    slotProvenance: 'spec',
    label: 'temperature/voltage trim (8x5)',
    shape: 'trim',
    axes: [
      { inputAddress: COOLANT, count: 8 },
      { inputAddress: SUPPLY, count: 5 },
    ],
    consumed: true,
  },
  {
    payloadAddress: 0x4967,
    slot: 18,
    slotProvenance: 'spec',
    label: 'temperature enrichment A',
    shape: 'temperature-enrichment',
    axes: [{ inputAddress: COOLANT, count: 8 }],
    consumed: true,
  },
  {
    payloadAddress: 0x4977,
    slot: 19,
    slotProvenance: 'spec',
    label: 'acceleration enrichment',
    shape: 'accel-enrichment',
    axes: [{ inputAddress: LOAD, count: 6 }],
    consumed: true,
  },
  {
    payloadAddress: 0x4988,
    slot: 20,
    slotProvenance: 'spec',
    label: 'temperature enrichment B',
    shape: 'temperature-enrichment',
    axes: [{ inputAddress: AIR, count: 9 }],
    consumed: true,
  },
  // --- fuel base families ---------------------------------------------------
  {
    payloadAddress: 0x49c1,
    slot: 25,
    slotProvenance: 'spec',
    label: 'idle fuel',
    shape: 'fuel-idle',
    axes: [{ inputAddress: SPEED, count: 16 }],
    consumed: true,
  },
  {
    payloadAddress: 0x49df,
    slot: 26,
    slotProvenance: 'spec',
    label: 'WOT fuel variant A',
    shape: 'fuel-wot',
    axes: [{ inputAddress: SPEED, count: 12 }],
    consumed: true,
  },
  {
    payloadAddress: 0x4a2f,
    slot: 32,
    slotProvenance: 'spec',
    label: 'WOT fuel variant B',
    shape: 'fuel-wot',
    axes: [{ inputAddress: SPEED, count: 12 }],
    consumed: true,
  },
  ...([
    [0x4b42, 40, 8, 10],
    [0x4bac, 41, 12, 10],
    [0x4cd4, 42, 8, 10],
    [0x4d3e, 43, 12, 10],
    [0x4e66, 44, 8, 10],
    [0x4ed0, 45, 12, 10],
  ] as const).map(([payloadAddress, slot, rows, columns]): PayloadEntry => ({
    payloadAddress,
    slot,
    slotProvenance: 'model',
    label: `low/part-throttle fuel family ${payloadAddress.toString(16)}`,
    shape: 'fuel-base',
    axes: [
      { inputAddress: SPEED, count: rows },
      { inputAddress: LOAD, count: columns },
    ],
    consumed: false,
    note: 'no consumer in any recovered selector configuration',
  })),
  // --- ignition -------------------------------------------------------------
  {
    payloadAddress: 0x50eb,
    slot: 50,
    slotProvenance: 'model',
    label: 'dwell versus supply voltage and speed',
    shape: 'dwell',
    axes: [
      { inputAddress: SUPPLY, count: 8 },
      { inputAddress: SPEED, count: 8 },
    ],
    consumed: true,
  },
  {
    payloadAddress: 0x5165,
    slot: 51,
    slotProvenance: 'model',
    label: 'ignition advance family 5165',
    shape: 'ignition-advance',
    axes: [
      { inputAddress: SPEED, count: 4 },
      { inputAddress: LOAD, count: 6 },
    ],
    consumed: true,
  },
  {
    payloadAddress: 0x518c,
    slot: 52,
    slotProvenance: 'model',
    label: 'ignition idle family 518c',
    shape: 'ignition-idle',
    axes: [{ inputAddress: SPEED, count: 12 }],
    consumed: true,
  },
  ...([
    [0x51b6, 53, 8, 8],
    [0x52c2, 54, 8, 10],
    [0x532c, 55, 8, 8],
    [0x538b, 56, 8, 10],
    [0x53f5, 57, 12, 10],
    [0x54be, 58, 8, 10],
    [0x5587, 60, 8, 10],
  ] as const).map(([payloadAddress, slot, rows, columns]): PayloadEntry => ({
    payloadAddress,
    slot,
    slotProvenance: 'model',
    label: `ignition advance family ${payloadAddress.toString(16)}`,
    shape: 'ignition-advance',
    axes: [
      { inputAddress: SPEED, count: rows },
      { inputAddress: LOAD, count: columns },
    ],
    consumed: true,
  })),
  ...([
    [0x551d, 59],
    [0x55e6, 61],
  ] as const).map(([payloadAddress, slot]): PayloadEntry => ({
    payloadAddress,
    slot,
    slotProvenance: 'model',
    label: `ignition advance family ${payloadAddress.toString(16)}`,
    shape: 'ignition-advance',
    axes: [{ inputAddress: SPEED, count: 12 }],
    consumed: true,
  })),
  // --- idle targets ---------------------------------------------------------
  {
    payloadAddress: 0x57ef,
    slot: 70,
    slotProvenance: 'model',
    label: 'idle target, P/N, A/C on or off',
    shape: 'idle-target',
    axes: [{ inputAddress: COOLANT, count: 6 }],
    consumed: true,
    note: 'XDF axis-label count mismatch: four labels for six values',
  },
  {
    payloadAddress: 0x57fb,
    slot: 71,
    slotProvenance: 'model',
    label: 'idle target, D/R with A/C on',
    shape: 'idle-target',
    axes: [{ inputAddress: COOLANT, count: 4 }],
    consumed: true,
  },
  {
    payloadAddress: 0x5805,
    slot: 72,
    slotProvenance: 'model',
    label: 'idle target, D/R with A/C off',
    shape: 'idle-target',
    axes: [{ inputAddress: COOLANT, count: 4 }],
    consumed: true,
  },
];
