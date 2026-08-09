/**
 * External-3/CC0 dispatch and the compare/capture worker.
 *
 * Proven: `CODE:0053` enters `20a0`, and bit `BITS:0021` selects either
 * `CODE:2462` (the timestamp worker) or `CODE:21d8` ("a larger compare/capture
 * worker that consumes timer/port state and updates event state").
 * `INTMEM:0048` counts capture phases, `INTMEM:004f` points into the timestamp
 * buffer, and state at `004a`, `0071` and bit-addressable RAM controls the
 * alternative worker and synchronization transitions.
 *
 * What the bit *means* is not recovered. This model reads it as the
 * acquired/locked distinction — timestamps while acquiring, scheduling once
 * locked — and marks that as interpretation. SPECS is equally clear that tooth
 * count, missing-tooth pattern and cylinder phase names are not established, so
 * no tooth pattern is decoded here: a capture is a capture.
 */

import type { Ticks } from '../types.ts';
import type { SpeedEstimate } from './speed-estimate.ts';
import { BITS, IDATA } from '../memory-map.ts';
import { estimateSpeed } from './speed-estimate.ts';
import type { CrankCapture } from './crank-capture.ts';
import type { EcuContext } from '../context.ts';

export const SYNC_STATE = { lost: 0, acquiring: 1, locked: 2 } as const;

/** Consecutive plausible periods before the model declares lock. */
const LOCK_THRESHOLD = 4;
/** A period may not grow by more than this factor without breaking lock. */
const PLAUSIBLE_RATIO = 4;

export class CrankSync {
  private consecutive = 0;
  private lastCaptureAt: Ticks = 0;
  private estimate: SpeedEstimate | null = null;
  /** Loss-of-sync count. SPECS: such counters exist, but no unique
   *  timeout-to-fuel-cut path is proven, so nothing consumes this. */
  lossOfSyncCount = 0;

  private readonly context: EcuContext;
  private readonly capture: CrankCapture;
  /** Called on every capture once locked, to re-arm scheduled outputs. */
  private readonly onScheduleWindow: (period: number) => void;

  constructor(
    context: EcuContext,
    capture: CrankCapture,
    onScheduleWindow: (period: number) => void,
  ) {
    this.context = context;
    this.capture = capture;
    this.onScheduleWindow = onScheduleWindow;
  }

  initialise(): void {
    const { idata } = this.context.machine;
    idata.write(IDATA.syncState, SYNC_STATE.lost);
    idata.write(IDATA.captureAltState, 0);
    idata.setBit(BITS.captureWorkerSelect, false);
    this.consecutive = 0;
    this.estimate = null;
  }

  /** CODE:20a0 — the external-3/CC0 entry. */
  onCaptureInterrupt(): void {
    const { idata, timer2 } = this.context.machine;
    timer2.capture();

    if (idata.getBit(BITS.captureWorkerSelect)) {
      this.serviceCompareWorker();
      return;
    }
    this.capture.service();
    this.updateSynchronization();
  }

  /** CODE:21d8 — consumes timer/port state and updates event state. Once
   *  locked, each capture re-opens the scheduling window for the next segment. */
  private serviceCompareWorker(): void {
    const { idata } = this.context.machine;
    this.capture.service();
    idata.increment(IDATA.captureAltState);
    this.updateSynchronization();
    const period = this.capture.lastPeriod();
    if (period !== null && this.state() === SYNC_STATE.locked) this.onScheduleWindow(period);
  }

  private updateSynchronization(): void {
    const { idata, assumptions } = this.context.machine;
    const period = this.capture.lastPeriod();
    this.lastCaptureAt = this.context.machine.now();
    if (period === null || period === 0) return;

    const previous = this.estimate;
    const next = estimateSpeed(assumptions, period);
    if (next === null) return;

    const plausible =
      previous === null ||
      (period <= previous.periodTicks * PLAUSIBLE_RATIO &&
        period * PLAUSIBLE_RATIO >= previous.periodTicks);

    this.estimate = next;
    if (!plausible) {
      this.breakLock();
      return;
    }

    this.consecutive += 1;
    if (this.consecutive >= LOCK_THRESHOLD) {
      idata.write(IDATA.syncState, SYNC_STATE.locked);
      idata.setBit(BITS.captureWorkerSelect, true);
    } else {
      idata.write(IDATA.syncState, SYNC_STATE.acquiring);
    }
  }

  /** Called from the foreground cycle: a capture that never arrives. */
  checkTimeout(): void {
    if (this.state() === SYNC_STATE.lost) return;
    const period = this.capture.lastPeriod();
    if (period === null) return;
    const since = this.context.machine.now() - this.lastCaptureAt;
    if (since > period * PLAUSIBLE_RATIO) this.breakLock();
  }

  private breakLock(): void {
    const { idata } = this.context.machine;
    if (idata.read(IDATA.syncState) === SYNC_STATE.locked) this.lossOfSyncCount += 1;
    this.consecutive = 0;
    this.estimate = null;
    idata.write(IDATA.syncState, SYNC_STATE.lost);
    idata.setBit(BITS.captureWorkerSelect, false);
  }

  state(): number {
    return this.context.machine.idata.read(IDATA.syncState);
  }

  isLocked(): boolean {
    return this.state() === SYNC_STATE.locked;
  }

  speed(): SpeedEstimate | null {
    return this.estimate;
  }
}
