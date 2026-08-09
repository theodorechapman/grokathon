/**
 * The named locations the specification recovered, in the order a reader of
 * SPECS.md meets them.
 *
 * Every address here comes from `src/memory-map.ts` — none is retyped — so the
 * grid on the page cannot drift from the model. The names are the
 * specification's names.
 */

import { BITS, IDATA, XRAM } from '../../src/memory-map.ts';

export type MemorySpace = 'INTMEM' | 'BITS' | 'XRAM';

export interface MemoryCell {
  space: MemorySpace;
  address: number;
  name: string;
  /** Shown when the cell is pointed at. */
  note?: string;
}

export const MEMORY_CELLS: readonly MemoryCell[] = [
  { space: 'INTMEM', address: IDATA.scaledSupplyVoltage, name: 'scaled supply voltage' },
  { space: 'INTMEM', address: IDATA.intakeAirTemperature, name: 'intake-air temperature' },
  { space: 'INTMEM', address: IDATA.coolantTemperature, name: 'coolant temperature' },
  {
    space: 'INTMEM',
    address: IDATA.hystereticChannel,
    name: 'hysteretic channel',
    note: 'possibly lambda; identity not established',
  },
  { space: 'INTMEM', address: IDATA.unresolvedChannel, name: 'unresolved channel' },
  {
    space: 'INTMEM',
    address: IDATA.encodedEngineSpeed,
    name: 'encoded engine speed',
    note: 'CODE:6099 derives it; the byte-per-RPM scale is not proven',
  },
  { space: 'INTMEM', address: IDATA.timer2OverflowEpoch, name: 'timer-2 overflow epoch' },
  {
    space: 'INTMEM',
    address: IDATA.normalizedLoad,
    name: 'normalized load',
    note: 'CODE:3610 compares 003b and 0040; the load equation itself is not proven',
  },
  { space: 'INTMEM', address: IDATA.filteredAirMassHigh, name: 'filtered air mass, high' },
  { space: 'INTMEM', address: IDATA.filteredAirMassLow, name: 'filtered air mass, low' },
  { space: 'INTMEM', address: IDATA.capturePhase, name: 'capture phase counter' },
  { space: 'INTMEM', address: IDATA.captureAltState, name: 'compare-worker state' },
  { space: 'INTMEM', address: IDATA.timestampPointer, name: 'timestamp write pointer' },
  {
    space: 'INTMEM',
    address: IDATA.revCutCountdown,
    name: 'rev-cut countdown',
    note: 'loaded from record offset 0x12 by CODE:2ad9-2ade',
  },
  { space: 'INTMEM', address: IDATA.adaptationCompositeA, name: 'adaptive composite A' },
  { space: 'INTMEM', address: IDATA.adaptationCompositeB, name: 'adaptive composite B' },
  { space: 'INTMEM', address: IDATA.adaptationCompositeC, name: 'adaptive composite C' },
  {
    space: 'INTMEM',
    address: IDATA.heartbeat,
    name: 'timer-1 heartbeat',
    note: 'the supervisor decrements it; expiry reaches restart',
  },
  { space: 'INTMEM', address: IDATA.syncState, name: 'sync state' },
  { space: 'INTMEM', address: IDATA.pointerWindowLow, name: 'pointer window, high byte' },
  { space: 'INTMEM', address: IDATA.pointerWindowHigh, name: 'pointer window, low byte' },
  { space: 'INTMEM', address: IDATA.selectorTableLow, name: 'selector table, high byte' },
  { space: 'INTMEM', address: IDATA.selectorTableHigh, name: 'selector table, low byte' },
  { space: 'INTMEM', address: IDATA.overrunTimer, name: 'overrun latch timer' },

  {
    space: 'BITS',
    address: BITS.captureWorkerSelect,
    name: 'capture worker select',
    note: 'chooses CODE:21d8 or CODE:2462 in the external-3/CC0 path',
  },
  { space: 'BITS', address: BITS.timer1Serviced, name: 'timer-1 serviced' },
  {
    space: 'BITS',
    address: BITS.revCutStageActive,
    name: 'rev cut stage active',
    note: 'the bit CODE:27cc owns',
  },
  { space: 'BITS', address: BITS.revCutStageComplement, name: 'rev cut complement' },
  { space: 'BITS', address: BITS.overrunActive, name: 'overrun latch', note: 'owned by CODE:3723' },
  {
    space: 'BITS',
    address: BITS.calibrationMissing,
    name: 'calibration missing',
    note: 'set when a descriptor selector returns 0xff (CODE:0413-0418)',
  },

  { space: 'XRAM', address: XRAM.adaptationCellA, name: 'adaptation cell A' },
  { space: 'XRAM', address: XRAM.adaptationCellB, name: 'adaptation cell B' },
  { space: 'XRAM', address: XRAM.adaptationStatus, name: 'adaptation status nibbles' },
  { space: 'XRAM', address: XRAM.fallbackCellA, name: 'fallback cell A' },
  { space: 'XRAM', address: XRAM.fallbackCellB, name: 'fallback cell B' },
  { space: 'XRAM', address: XRAM.wotVariantHigh, name: 'WOT variant, high' },
  { space: 'XRAM', address: XRAM.wotVariantLow, name: 'WOT variant, low' },
  {
    space: 'XRAM',
    address: XRAM.transientEnrichment,
    name: 'transient enrichment',
    note: 'CODE:3585 — high8(calibration_a * calibration_b)',
  },
  {
    space: 'XRAM',
    address: XRAM.modeField,
    name: 'mode field',
    note: 'bits 3-5 select a record field in CODE:3610',
  },
  { space: 'XRAM', address: XRAM.faultCount, name: 'stored fault count' },
  { space: 'XRAM', address: XRAM.startupMarkerA, name: 'startup marker A' },
  { space: 'XRAM', address: XRAM.startupMarkerB, name: 'startup marker B' },
  { space: 'XRAM', address: XRAM.retainedCounter, name: 'retained restart counter' },
  {
    space: 'XRAM',
    address: XRAM.revLimitCopyBase,
    name: 'rev-limit copy 42d0',
    note: 'CODE:3530 copies 42d0-42d2 here',
  },
  { space: 'XRAM', address: XRAM.revLimitCopyBase + 1, name: 'rev-limit copy 42d1' },
  { space: 'XRAM', address: XRAM.revLimitCopyBase + 2, name: 'rev-limit copy 42d2' },
];
