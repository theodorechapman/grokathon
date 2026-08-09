/**
 * Software recovery, CODE:2564.
 *
 * "CODE:2564 disables global interrupts, writes XRAM sentinels, invokes 25f7
 * three times, and re-enters 5c00; this is a software recovery or
 * reinitialization path."
 *
 * SPECS will not say what triggers it: "The 2564 -> 5c00 path is firmware proof
 * of recovery, but the triggering fault condition and whether an external
 * watchdog also resets the processor remain unresolved." So this module
 * performs the sequence and records the reason its caller gave; it never
 * decides on its own that recovery is warranted.
 */

import type { RestartReason } from '../context.ts';
import { XRAM } from '../memory-map.ts';
import type { Machine } from '../hardware/machine.ts';
import { MARKER_A, MARKER_B } from './startup.ts';

/** How many times CODE:2564 invokes the service at 25f7. */
export const SERVICE_INVOCATIONS = 3;

export interface RecoveryOutcome {
  reason: RestartReason;
  serviceCalls: number;
}

export const runRecovery = (
  machine: Machine,
  reason: RestartReason,
  /** CODE:25f7 — the service invoked three times before re-entry. */
  service: () => void,
): RecoveryOutcome => {
  machine.interrupts.globalEnable(false);

  // Recovery sentinels: the markers are written, so the startup that follows
  // takes the warm path and the retained counter records the event.
  machine.xram.write(XRAM.startupMarkerA, MARKER_A);
  machine.xram.write(XRAM.startupMarkerB, MARKER_B);

  for (let i = 0; i < SERVICE_INVOCATIONS; i += 1) service();

  machine.emit({ kind: 'restart', channel: 'recovery-2564', detail: { reason } });
  return { reason, serviceCalls: SERVICE_INVOCATIONS };
};
