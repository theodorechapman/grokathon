/**
 * What every subsystem is handed.
 *
 * Subsystems reach the hardware and the calibration through this, and reach the
 * two cross-cutting services — fault reporting and restart — through function
 * hooks. That keeps fault memory and the reset path from importing the
 * subsystems that call them.
 */

import type { Assumptions } from './assumptions.ts';
import type { CalibrationImage } from './calibration/calibration-image.ts';
import type { LookupService } from './calibration/lookup-service.ts';
import type { Machine } from './hardware/machine.ts';

/** Why software control was re-entered. Both proven paths are named. */
export type RestartReason =
  | 'recovery-2564'
  | 'serial-timeout-8943'
  | 'watchdog'
  | 'power-on';

export interface EcuContext {
  machine: Machine;
  calibration: CalibrationImage;
  lookup: LookupService;
  assumptions: Assumptions;
  /** CODE:8e50 — create or update a fault record. */
  reportFault(identifier: number, subtype: number, snapshotA?: number, snapshotB?: number): void;
  /** Re-enter initialisation at CODE:5c00. */
  restart(reason: RestartReason): void;
}
