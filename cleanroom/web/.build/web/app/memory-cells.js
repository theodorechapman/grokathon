"use strict";
/**
 * The named locations the specification recovered, in the order a reader of
 * SPECS.md meets them.
 *
 * Every address here comes from `src/memory-map.ts` — none is retyped — so the
 * grid on the page cannot drift from the model. The names are the
 * specification's names.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MEMORY_CELLS = void 0;
const memory_map_ts_1 = require("../../src/memory-map.js");
exports.MEMORY_CELLS = [
    { space: 'INTMEM', address: memory_map_ts_1.IDATA.scaledSupplyVoltage, name: 'scaled supply voltage' },
    { space: 'INTMEM', address: memory_map_ts_1.IDATA.intakeAirTemperature, name: 'intake-air temperature' },
    { space: 'INTMEM', address: memory_map_ts_1.IDATA.coolantTemperature, name: 'coolant temperature' },
    {
        space: 'INTMEM',
        address: memory_map_ts_1.IDATA.hystereticChannel,
        name: 'hysteretic channel',
        note: 'possibly lambda; identity not established',
    },
    { space: 'INTMEM', address: memory_map_ts_1.IDATA.unresolvedChannel, name: 'unresolved channel' },
    {
        space: 'INTMEM',
        address: memory_map_ts_1.IDATA.encodedEngineSpeed,
        name: 'encoded engine speed',
        note: 'CODE:6099 derives it; the byte-per-RPM scale is not proven',
    },
    { space: 'INTMEM', address: memory_map_ts_1.IDATA.timer2OverflowEpoch, name: 'timer-2 overflow epoch' },
    {
        space: 'INTMEM',
        address: memory_map_ts_1.IDATA.normalizedLoad,
        name: 'normalized load',
        note: 'CODE:3610 compares 003b and 0040; the load equation itself is not proven',
    },
    { space: 'INTMEM', address: memory_map_ts_1.IDATA.filteredAirMassHigh, name: 'filtered air mass, high' },
    { space: 'INTMEM', address: memory_map_ts_1.IDATA.filteredAirMassLow, name: 'filtered air mass, low' },
    { space: 'INTMEM', address: memory_map_ts_1.IDATA.capturePhase, name: 'capture phase counter' },
    { space: 'INTMEM', address: memory_map_ts_1.IDATA.captureAltState, name: 'compare-worker state' },
    { space: 'INTMEM', address: memory_map_ts_1.IDATA.timestampPointer, name: 'timestamp write pointer' },
    {
        space: 'INTMEM',
        address: memory_map_ts_1.IDATA.revCutCountdown,
        name: 'rev-cut countdown',
        note: 'loaded from record offset 0x12 by CODE:2ad9-2ade',
    },
    { space: 'INTMEM', address: memory_map_ts_1.IDATA.adaptationCompositeA, name: 'adaptive composite A' },
    { space: 'INTMEM', address: memory_map_ts_1.IDATA.adaptationCompositeB, name: 'adaptive composite B' },
    { space: 'INTMEM', address: memory_map_ts_1.IDATA.adaptationCompositeC, name: 'adaptive composite C' },
    {
        space: 'INTMEM',
        address: memory_map_ts_1.IDATA.heartbeat,
        name: 'timer-1 heartbeat',
        note: 'the supervisor decrements it; expiry reaches restart',
    },
    { space: 'INTMEM', address: memory_map_ts_1.IDATA.syncState, name: 'sync state' },
    { space: 'INTMEM', address: memory_map_ts_1.IDATA.pointerWindowLow, name: 'pointer window, high byte' },
    { space: 'INTMEM', address: memory_map_ts_1.IDATA.pointerWindowHigh, name: 'pointer window, low byte' },
    { space: 'INTMEM', address: memory_map_ts_1.IDATA.selectorTableLow, name: 'selector table, high byte' },
    { space: 'INTMEM', address: memory_map_ts_1.IDATA.selectorTableHigh, name: 'selector table, low byte' },
    { space: 'INTMEM', address: memory_map_ts_1.IDATA.overrunTimer, name: 'overrun latch timer' },
    {
        space: 'BITS',
        address: memory_map_ts_1.BITS.captureWorkerSelect,
        name: 'capture worker select',
        note: 'chooses CODE:21d8 or CODE:2462 in the external-3/CC0 path',
    },
    { space: 'BITS', address: memory_map_ts_1.BITS.timer1Serviced, name: 'timer-1 serviced' },
    {
        space: 'BITS',
        address: memory_map_ts_1.BITS.revCutStageActive,
        name: 'rev cut stage active',
        note: 'the bit CODE:27cc owns',
    },
    { space: 'BITS', address: memory_map_ts_1.BITS.revCutStageComplement, name: 'rev cut complement' },
    { space: 'BITS', address: memory_map_ts_1.BITS.overrunActive, name: 'overrun latch', note: 'owned by CODE:3723' },
    {
        space: 'BITS',
        address: memory_map_ts_1.BITS.calibrationMissing,
        name: 'calibration missing',
        note: 'set when a descriptor selector returns 0xff (CODE:0413-0418)',
    },
    { space: 'XRAM', address: memory_map_ts_1.XRAM.adaptationCellA, name: 'adaptation cell A' },
    { space: 'XRAM', address: memory_map_ts_1.XRAM.adaptationCellB, name: 'adaptation cell B' },
    { space: 'XRAM', address: memory_map_ts_1.XRAM.adaptationStatus, name: 'adaptation status nibbles' },
    { space: 'XRAM', address: memory_map_ts_1.XRAM.fallbackCellA, name: 'fallback cell A' },
    { space: 'XRAM', address: memory_map_ts_1.XRAM.fallbackCellB, name: 'fallback cell B' },
    { space: 'XRAM', address: memory_map_ts_1.XRAM.wotVariantHigh, name: 'WOT variant, high' },
    { space: 'XRAM', address: memory_map_ts_1.XRAM.wotVariantLow, name: 'WOT variant, low' },
    {
        space: 'XRAM',
        address: memory_map_ts_1.XRAM.transientEnrichment,
        name: 'transient enrichment',
        note: 'CODE:3585 — high8(calibration_a * calibration_b)',
    },
    {
        space: 'XRAM',
        address: memory_map_ts_1.XRAM.modeField,
        name: 'mode field',
        note: 'bits 3-5 select a record field in CODE:3610',
    },
    { space: 'XRAM', address: memory_map_ts_1.XRAM.faultCount, name: 'stored fault count' },
    { space: 'XRAM', address: memory_map_ts_1.XRAM.startupMarkerA, name: 'startup marker A' },
    { space: 'XRAM', address: memory_map_ts_1.XRAM.startupMarkerB, name: 'startup marker B' },
    { space: 'XRAM', address: memory_map_ts_1.XRAM.retainedCounter, name: 'retained restart counter' },
    {
        space: 'XRAM',
        address: memory_map_ts_1.XRAM.revLimitCopyBase,
        name: 'rev-limit copy 42d0',
        note: 'CODE:3530 copies 42d0-42d2 here',
    },
    { space: 'XRAM', address: memory_map_ts_1.XRAM.revLimitCopyBase + 1, name: 'rev-limit copy 42d1' },
    { space: 'XRAM', address: memory_map_ts_1.XRAM.revLimitCopyBase + 2, name: 'rev-limit copy 42d2' },
];
