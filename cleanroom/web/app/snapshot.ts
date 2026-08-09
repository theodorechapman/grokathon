/**
 * One frame of the running controller, read straight out of the model.
 *
 * Nothing here computes engine behaviour; every field is either a memory read
 * at an address the specification names, or a value a subsystem just produced.
 */

import type { Ecu } from '../../src/ecu.ts';
import type { Snapshot } from './bench.ts';
import { MEMORY_CELLS } from './memory-cells.ts';

const readCells = (ecu: Ecu): number[] =>
  MEMORY_CELLS.map((cell) => {
    if (cell.space === 'BITS') return ecu.machine.idata.getBit(cell.address) ? 1 : 0;
    if (cell.space === 'XRAM') return ecu.machine.xram.read(cell.address);
    return ecu.machine.idata.read(cell.address);
  });

export const readSnapshot = (ecu: Ecu): Snapshot => {
  const speed = ecu.parts.sync.speed();
  const records = ecu.parts.limiter.rawRecords();
  const counts = ecu.interruptCounts();
  const period = ecu.parts.capture.lastPeriod();

  return {
    availability: {
      runtime: true,
      readouts: true,
      memory: true,
      trace: true,
    },
    machineMs: ecu.machine.ms(),
    mode: ecu.parts.load.operatingMode(),
    syncState: ecu.parts.sync.state(),
    syncLocked: ecu.parts.sync.isLocked(),
    capturePeriodTicks: period,
    captureCorrections: ecu.parts.capture.corrections(),
    rpm: speed?.rpm ?? 0,
    encodedSpeed: ecu.parts.load.comparisonInputs().encodedSpeed,
    normalizedLoad: ecu.parts.load.comparisonInputs().normalizedLoad,
    airMassFiltered: ecu.parts.airMass.filtered(),
    fuel: ecu.parts.fuel.latest(),
    ignition: ecu.parts.ignition.latest(),
    idle: ecu.parts.idle.latest(),
    limiter: ecu.parts.limiter.state(),
    limitByte: records[0].limit,
    bufferByte: records[0].buffer,
    overrunActive: ecu.parts.overrun.isActive(),
    foregroundCycles: ecu.executive.cycles,
    captureInterrupts: counts.ext3cc0 ?? 0,
    faultCount: ecu.parts.faults.count(),
    cells: readCells(ecu),
  };
};
