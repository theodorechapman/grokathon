/**
 * Staged rev cut, CODE:27cc.
 *
 * Proven: 27cc consumes the primary record — `2909-291f` reads record fields
 * through offset 0x11 (42d5) and `2ad9-2ade` selects offset 0x12 (42d6) into
 * INTMEM:0052 — and owns BITS:0038 (`rev_cut_stage_active`), complementary
 * BITS:003a, and the transition countdown at INTMEM:0052. CODE:3530
 * independently copies 42d0-42d2 into XRAM 0207-0209. No direct access to the
 * secondary 4313/4314 pair is recovered, so this model reads only the primary.
 *
 * The RPM conversion (`912500 / 0x90 = 6336.8`) and the staged-injector-cut
 * narrative are XDF claims, graded Low by SPECS, and "the full chain from these
 * latches to a physical injector or ignition output has not been uniquely
 * proven". This model does wire the latch to fuel suppression — it has to do
 * something — and marks that edge as the unproven one.
 */

import type { LimiterState } from '../types.ts';
import { BITS, IDATA, XRAM } from '../memory-map.ts';
import { REV_LIMIT, readRevLimitRecord } from '../calibration/rev-limit-record.ts';
import type { EcuContext } from '../context.ts';
import type { CrankSync } from './crank-sync.ts';

export class RevLimiter {
  private limitRpm = 0;
  private resumeRpm = 0;

  private readonly context: EcuContext;
  private readonly sync: CrankSync;

  constructor(context: EcuContext, sync: CrankSync) {
    this.context = context;
    this.sync = sync;
  }

  /** Read the primary record, and perform the CODE:3530 copy. */
  initialise(): void {
    const { calibration, machine, assumptions } = this.context;
    const record = readRevLimitRecord((a) => calibration.read(a), REV_LIMIT.primaryRecordBase);

    this.limitRpm = record.limit === 0 ? 0 : assumptions.revLimitNumerator / record.limit;
    this.resumeRpm = this.limitRpm - record.buffer * assumptions.rpmPerBufferCount;

    // CODE:2ad9-2ade — the buffer byte lands in INTMEM:0052.
    machine.idata.write(IDATA.revCutCountdown, record.buffer);
    machine.idata.setBit(BITS.revCutStageActive, false);
    machine.idata.setBit(BITS.revCutStageComplement, true);

    // CODE:3530 — copy 42d0-42d2 into XRAM 0207-0209.
    for (let i = 0; i < REV_LIMIT.copyLength; i += 1) {
      machine.xram.write(XRAM.revLimitCopyBase + i, calibration.read(REV_LIMIT.copySourceBase + i));
    }
  }

  /** Called from the foreground cycle. */
  update(): void {
    const { idata } = this.context.machine;
    const rpm = this.sync.speed()?.rpm ?? 0;
    const active = idata.getBit(BITS.revCutStageActive);

    if (!active) {
      if (rpm >= this.limitRpm && this.limitRpm > 0) {
        idata.setBit(BITS.revCutStageActive, true);
        idata.setBit(BITS.revCutStageComplement, false);
        idata.write(IDATA.revCutCountdown, this.bufferByte());
      }
      return;
    }

    if (rpm > this.resumeRpm) {
      // Still above the release point: hold the stage and reload the countdown.
      idata.write(IDATA.revCutCountdown, this.bufferByte());
      return;
    }

    const { expired } = idata.decrementToZero(IDATA.revCutCountdown);
    if (!expired) return;
    idata.setBit(BITS.revCutStageActive, false);
    idata.setBit(BITS.revCutStageComplement, true);
  }

  private bufferByte(): number {
    return this.context.calibration.read(REV_LIMIT.primaryRecordBase + REV_LIMIT.bufferOffset);
  }

  isCutting(): boolean {
    return this.context.machine.idata.getBit(BITS.revCutStageActive);
  }

  state(): Pick<LimiterState, 'cutStageActive' | 'cutStageComplement' | 'countdown' | 'limitRpm' | 'resumeRpm'> {
    const { idata } = this.context.machine;
    return {
      cutStageActive: idata.getBit(BITS.revCutStageActive),
      cutStageComplement: idata.getBit(BITS.revCutStageComplement),
      countdown: idata.read(IDATA.revCutCountdown),
      limitRpm: this.limitRpm,
      resumeRpm: this.resumeRpm,
    };
  }

  /** The raw record values, which is all SPECS is willing to assert. */
  rawRecords(): Array<{ base: number; limit: number; buffer: number; consumed: boolean }> {
    const read = (a: number): number => this.context.calibration.read(a);
    return [
      { ...readRevLimitRecord(read, REV_LIMIT.primaryRecordBase), consumed: true },
      { ...readRevLimitRecord(read, REV_LIMIT.secondaryRecordBase), consumed: false },
    ];
  }
}
