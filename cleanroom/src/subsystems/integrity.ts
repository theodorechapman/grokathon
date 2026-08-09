/**
 * ROM checksum and RAM test.
 *
 * The checksum is the most completely proven algorithm in the whole
 * specification, so it is reproduced exactly. CODE:9016 "initializes R1:R0 to
 * zero, starts DPTR=0000, reads each byte with MOVC, accumulates modulo 65536,
 * and loops until DPTR=9f00. It then compares CODE:9f00 with high accumulator
 * R1 and 9f01 with low accumulator R0. There is no seed, complement, CRC, or
 * word summation." Failure records identifier 4532 with subtype 4.
 *
 * CODE:90f5 "destructively tests XRAM page-0 offsets ff down through 01 with
 * 0x55 and 0xaa, stopping on the first mismatch and reporting the 4532
 * identifier with subtype 1." Offset 0 is excluded by the specification's own
 * bounds, and this model honours that.
 *
 * SPECS also records that "The XDF checksum declaration at physical 0x7ffd
 * points to erased ffff bytes and is not credible for this image" — so the only
 * checksum location this model knows is 9f00.
 */

import { CODE, ROM_CHECKSUM } from '../memory-map.ts';
import type { EcuContext } from '../context.ts';
import { FAULT_TABLE_IDENTIFIER, SUBTYPE } from './fault-monitors.ts';

export interface ChecksumResult {
  computed: number;
  stored: number;
  passed: number;
}

export interface RamTestResult {
  passed: boolean;
  /** Page-0 offset of the first mismatch, or null. */
  failedOffset: number | null;
}

/** Test patterns, in the order CODE:90f5 applies them. */
const PATTERNS = [0x55, 0xaa];

export class IntegrityChecks {
  private readonly context: EcuContext;

  constructor(context: EcuContext) {
    this.context = context;
  }

  /** CODE:9016. Accumulates the whole coverage range in one call; a chunked
   *  variant exists below for the foreground cycle. */
  verifyChecksum(): { computed: number; stored: number; passed: boolean } {
    const { rom } = this.context.machine;
    let accumulator = 0;
    for (let address = 0; address < CODE.checksumCoverageEnd; address += 1) {
      accumulator = (accumulator + rom[address]) & 0xffff;
    }
    const stored = (rom[CODE.checksumWord] << 8) | rom[CODE.checksumWord + 1];
    const passed = accumulator === stored;
    if (!passed) {
      this.context.reportFault(
        FAULT_TABLE_IDENTIFIER,
        SUBTYPE.romChecksum,
        (accumulator >> 8) & 0xff,
        accumulator & 0xff,
      );
    }
    return { computed: accumulator, stored, passed };
  }

  /** The invariant the specification states outright, checked independently of
   *  the stored word. */
  checksumMatchesSpecification(): boolean {
    return this.verifyChecksum().computed === ROM_CHECKSUM;
  }

  /**
   * CODE:90f5 — destructive page-0 RAM test, ff down through 01.
   *
   * It is destructive by design; the caller runs it before the runtime state it
   * would clobber exists, which is why startup is the only place it belongs.
   */
  testRam(): RamTestResult {
    const { xram } = this.context.machine;
    for (let offset = 0xff; offset >= 0x01; offset -= 1) {
      for (const pattern of PATTERNS) {
        xram.write(offset, pattern);
        if (xram.read(offset) !== pattern) {
          this.context.reportFault(FAULT_TABLE_IDENTIFIER, SUBTYPE.ramTest, offset, pattern);
          return { passed: false, failedOffset: offset };
        }
      }
      xram.write(offset, 0);
    }
    return { passed: true, failedOffset: null };
  }
}

/** Chunked checksum state, so the foreground cycle can verify across passes
 *  without stalling. The algorithm is unchanged; only the loop is split. */
export class ChunkedChecksum {
  private address = 0;
  private accumulator = 0;
  lastResult: ChecksumResult | null = null;

  private readonly integrity: IntegrityChecks;
  private readonly rom: Uint8Array;
  private readonly bytesPerPass: number;

  constructor(integrity: IntegrityChecks, rom: Uint8Array, bytesPerPass = 512) {
    this.integrity = integrity;
    this.rom = rom;
    this.bytesPerPass = bytesPerPass;
  }

  /** Returns true when a full pass completed. */
  step(): boolean {
    const end = Math.min(CODE.checksumCoverageEnd, this.address + this.bytesPerPass);
    for (; this.address < end; this.address += 1) {
      this.accumulator = (this.accumulator + this.rom[this.address]) & 0xffff;
    }
    if (this.address < CODE.checksumCoverageEnd) return false;

    const stored = (this.rom[CODE.checksumWord] << 8) | this.rom[CODE.checksumWord + 1];
    this.lastResult = {
      computed: this.accumulator,
      stored,
      passed: this.accumulator === stored ? 1 : 0,
    };
    if (this.accumulator !== stored) this.integrity.verifyChecksum();
    this.address = 0;
    this.accumulator = 0;
    return true;
  }
}
