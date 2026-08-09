/**
 * Fault memory.
 *
 * Format, proven: "Fault memory is XRAM 0300-03fe, at most 51 records of five
 * bytes: +0 fault identifier; +1 status/class/subtype; +2/+3 snapshots; +4
 * aging counter. XRAM 00ec is the count, 00ed-00f1 is a selected-record cache,
 * and 00f2-00f3 points at the current record."
 *
 * Status bits, proven: "low nibble: monitor-supplied subtype/state; bit 4:
 * ROM-table class property; bit 5: qualified/stored; bit 6: currently active;
 * bit 7: previously active/healed history."
 *
 * Routines: CODE:8e50 creates or updates records, CODE:955c ages inactive
 * records and maintains global fallback timers, CODE:89c4 clears all records,
 * caches, monitor counters and adaptation status 002f.
 *
 * SPECS is explicit that no EEPROM write was recovered: "Adaptation and fault
 * state are XRAM unless external retention hardware proves otherwise." Nothing
 * here persists.
 */

import type { FaultRecord } from '../types.ts';
import { bitWrite, lowNibble, packNibbles, u8 } from '../byte-math.ts';
import { XRAM } from '../memory-map.ts';
import type { ExternalMemory } from '../hardware/external-memory.ts';

export const RECORD_BYTES = 5;
export const MAX_RECORDS = 51;

export const STATUS_BIT = {
  romTableClass: 4,
  qualifiedStored: 5,
  currentlyActive: 6,
  previouslyActive: 7,
} as const;

const FIELD = { identifier: 0, status: 1, snapshotA: 2, snapshotB: 3, age: 4 } as const;

export class FaultMemory {
  private readonly xram: ExternalMemory;

  constructor(xram: ExternalMemory) {
    this.xram = xram;
  }

  private addressOf(index: number): number {
    return XRAM.faultRecordBase + index * RECORD_BYTES;
  }

  count(): number {
    return this.xram.read(XRAM.faultCount);
  }

  read(index: number): FaultRecord {
    const base = this.addressOf(index);
    return {
      index,
      identifier: this.xram.read(base + FIELD.identifier),
      status: this.xram.read(base + FIELD.status),
      snapshotA: this.xram.read(base + FIELD.snapshotA),
      snapshotB: this.xram.read(base + FIELD.snapshotB),
      age: this.xram.read(base + FIELD.age),
    };
  }

  all(): FaultRecord[] {
    return Array.from({ length: this.count() }, (_, index) => this.read(index));
  }

  find(identifier: number): FaultRecord | null {
    for (let index = 0; index < this.count(); index += 1) {
      const record = this.read(index);
      if (record.identifier === identifier) return record;
    }
    return null;
  }

  /**
   * CODE:8e50 — create or update. A repeat of an already-stored identifier
   * refreshes it rather than consuming another slot.
   */
  report(
    identifier: number,
    subtype: number,
    snapshotA = 0,
    snapshotB = 0,
    romTableClass = false,
  ): FaultRecord | null {
    const existing = this.find(identifier);
    const index = existing ? existing.index : this.count();
    if (index >= MAX_RECORDS) return null;

    const base = this.addressOf(index);
    const previous = existing ? existing.status : 0;
    let status = packNibbles(0, subtype);
    status = bitWrite(status, STATUS_BIT.romTableClass, romTableClass);
    status = bitWrite(status, STATUS_BIT.qualifiedStored, true);
    status = bitWrite(status, STATUS_BIT.currentlyActive, true);
    status = bitWrite(
      status,
      STATUS_BIT.previouslyActive,
      existing !== null || (previous & (1 << STATUS_BIT.previouslyActive)) !== 0,
    );

    this.xram.write(base + FIELD.identifier, identifier);
    this.xram.write(base + FIELD.status, status);
    this.xram.write(base + FIELD.snapshotA, snapshotA);
    this.xram.write(base + FIELD.snapshotB, snapshotB);
    this.xram.write(base + FIELD.age, 0);
    if (!existing) this.xram.write(XRAM.faultCount, index + 1);

    this.cache(index);
    return this.read(index);
  }

  /** A monitor reporting that its condition has gone away. */
  clearActive(identifier: number): void {
    const record = this.find(identifier);
    if (!record) return;
    const base = this.addressOf(record.index);
    let status = bitWrite(record.status, STATUS_BIT.currentlyActive, false);
    status = bitWrite(status, STATUS_BIT.previouslyActive, true);
    this.xram.write(base + FIELD.status, status);
  }

  /** CODE:955c — age inactive records; a healed record eventually drops out. */
  age(maximumAge = 40): void {
    for (let index = this.count() - 1; index >= 0; index -= 1) {
      const record = this.read(index);
      if ((record.status >> STATUS_BIT.currentlyActive) & 1) continue;
      const next = u8(record.age + 1);
      this.xram.write(this.addressOf(index) + FIELD.age, next);
      if (next >= maximumAge) this.remove(index);
    }
  }

  private remove(index: number): void {
    const last = this.count() - 1;
    for (let i = index; i < last; i += 1) {
      const from = this.addressOf(i + 1);
      const to = this.addressOf(i);
      for (let b = 0; b < RECORD_BYTES; b += 1) this.xram.write(to + b, this.xram.read(from + b));
    }
    const tail = this.addressOf(last);
    for (let b = 0; b < RECORD_BYTES; b += 1) this.xram.write(tail + b, 0);
    this.xram.write(XRAM.faultCount, last);
  }

  /** XRAM 00ed-00f1 selected-record cache, 00f2-00f3 current-record pointer. */
  cache(index: number): void {
    const base = this.addressOf(index);
    for (let b = 0; b < RECORD_BYTES; b += 1) {
      this.xram.write(XRAM.faultCacheBase + b, this.xram.read(base + b));
    }
    this.xram.writeWord(XRAM.faultCursorHigh, base);
  }

  /** CODE:89c4 — clear records, caches, monitor counters and adaptation
   *  status. The adaptation status byte is cleared by the same routine. */
  clearAll(): void {
    this.xram.fill(XRAM.faultRecordBase, XRAM.faultRecordEnd, 0);
    this.xram.write(XRAM.faultCount, 0);
    for (let b = 0; b < RECORD_BYTES; b += 1) this.xram.write(XRAM.faultCacheBase + b, 0);
    this.xram.writeWord(XRAM.faultCursorHigh, 0);
    this.xram.write(XRAM.adaptationStatus, 0);
  }

  subtypeOf(record: FaultRecord): number {
    return lowNibble(record.status);
  }
}
