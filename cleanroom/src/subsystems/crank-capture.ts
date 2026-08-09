/**
 * Capture worker, CODE:2462.
 *
 * Proven: it "reads CRCL, CRCH, TH2, and INTMEM:003f, stores timestamp triplets
 * through the pointer in INTMEM:004f, and advances that pointer by three
 * bytes", and it "includes a rollover correction when captured CRCH disagrees
 * with live TH2, proving that capture timestamps cross the 16-bit Timer-2
 * boundary". The timer-2 wrapper at 2070-2074 maintains the epoch byte.
 *
 * Where the triplet buffer lives is not recovered; this model puts it in
 * indirectly-addressable internal RAM and says so. Everything else here is the
 * specification's mechanism, unchanged.
 */

import type { CaptureEvent } from '../types.ts';
import { IDATA, SFR } from '../memory-map.ts';
import { timestamp24, u8 } from '../byte-math.ts';
import type { EcuContext } from '../context.ts';

/** Model-chosen location for the triplet ring. Upper internal RAM, indirect. */
export const TIMESTAMP_BUFFER_BASE = 0x80;
export const TIMESTAMP_BUFFER_TRIPLETS = 8;
const TRIPLET_BYTES = 3;

export class CrankCapture {
  readonly events: CaptureEvent[] = [];
  private rolloverCorrections = 0;

  private readonly context: EcuContext;

  constructor(context: EcuContext) {
    this.context = context;
  }

  initialise(): void {
    const { idata } = this.context.machine;
    idata.write(IDATA.timestampPointer, TIMESTAMP_BUFFER_BASE);
    idata.write(IDATA.capturePhase, 0);
    idata.write(IDATA.timer2OverflowEpoch, 0);
  }

  /** CODE:2070-2074 — increment the epoch and clear IRCON.TF2. */
  onTimer2Overflow(): void {
    const { idata, sfr } = this.context.machine;
    idata.increment(IDATA.timer2OverflowEpoch);
    sfr.setBit(SFR.IRCON, 6, false);
  }

  /** CODE:2462. */
  service(): CaptureEvent {
    const { idata, sfr } = this.context.machine;

    const low = sfr.read(SFR.CRCL);
    const high = sfr.read(SFR.CRCH);
    const liveHigh = sfr.read(SFR.TH2);
    let epoch = idata.read(IDATA.timer2OverflowEpoch);

    // Rollover correction: the capture latched before an overflow that the
    // epoch byte has already counted.
    let corrected = false;
    if (high > liveHigh) {
      epoch = u8(epoch - 1);
      corrected = true;
      this.rolloverCorrections += 1;
    }

    this.storeTriplet(epoch, high, low);
    idata.increment(IDATA.capturePhase);

    const event: CaptureEvent = {
      timestamp: timestamp24(epoch, high, low),
      epoch,
      high,
      low,
      rolloverCorrected: corrected,
    };
    this.events.push(event);
    if (this.events.length > TIMESTAMP_BUFFER_TRIPLETS) this.events.shift();
    return event;
  }

  /** Store `epoch:high:low` through INTMEM:004f and advance it by three. */
  private storeTriplet(epoch: number, high: number, low: number): void {
    const { idata } = this.context.machine;
    let pointer = idata.read(IDATA.timestampPointer);
    const limit = TIMESTAMP_BUFFER_BASE + TIMESTAMP_BUFFER_TRIPLETS * TRIPLET_BYTES;
    if (pointer < TIMESTAMP_BUFFER_BASE || pointer + TRIPLET_BYTES > limit) {
      pointer = TIMESTAMP_BUFFER_BASE;
    }
    idata.write(pointer, epoch);
    idata.write(pointer + 1, high);
    idata.write(pointer + 2, low);
    idata.write(IDATA.timestampPointer, pointer + TRIPLET_BYTES);
  }

  /** Period between the last two captures, in timer ticks, or null. */
  lastPeriod(): number | null {
    if (this.events.length < 2) return null;
    const latest = this.events[this.events.length - 1];
    const previous = this.events[this.events.length - 2];
    return (latest.timestamp - previous.timestamp) & 0xffffff;
  }

  capturePhase(): number {
    return this.context.machine.idata.read(IDATA.capturePhase);
  }

  corrections(): number {
    return this.rolloverCorrections;
  }
}
