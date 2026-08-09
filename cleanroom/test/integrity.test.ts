/** ROM checksum, RAM test, and fault memory. */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { createEcu } from '../src/ecu.ts';
import { buildRomImage, sumRange } from '../src/rom-image.ts';
import { CODE, ROM_CHECKSUM, XRAM } from '../src/memory-map.ts';
import { MAX_RECORDS, RECORD_BYTES, STATUS_BIT } from '../src/subsystems/fault-memory.ts';
import { FAULT_TABLE_IDENTIFIER, SUBTYPE } from '../src/subsystems/fault-monitors.ts';
import { readIdentity } from '../src/diagnostics/kw71-services.ts';

describe('ROM checksum', () => {
  it('holds the invariant sum(0000..9eff) mod 65536 = 0x7f2f', () => {
    const rom = buildRomImage();
    assert.equal(sumRange(rom, 0, CODE.checksumCoverageEnd), ROM_CHECKSUM);
  });

  it('stores the word big-endian at 9f00', () => {
    const rom = buildRomImage();
    assert.equal(rom[CODE.checksumWord], 0x7f);
    assert.equal(rom[CODE.checksumWord + 1], 0x2f);
  });

  it('CODE:9016 accumulates to the stored word with no seed or complement', () => {
    const ecu = createEcu();
    ecu.powerOn();
    const result = ecu.parts.integrity.verifyChecksum();
    assert.equal(result.computed, ROM_CHECKSUM);
    assert.equal(result.stored, ROM_CHECKSUM);
    assert.equal(result.passed, true);
  });

  it('reports identifier 4532 subtype 4 when the image is corrupt', () => {
    const ecu = createEcu();
    ecu.powerOn();
    ecu.machine.rom[0x1234] = (ecu.machine.rom[0x1234] + 1) & 0xff;

    const result = ecu.parts.integrity.verifyChecksum();
    assert.equal(result.passed, false);

    const record = ecu.parts.faults.find(FAULT_TABLE_IDENTIFIER);
    assert.ok(record);
    assert.equal(ecu.parts.faults.subtypeOf(record), SUBTYPE.romChecksum);
  });

  it('chunks the same algorithm across foreground passes', () => {
    const ecu = createEcu();
    ecu.powerOn();
    let completed = false;
    for (let i = 0; i < 200 && !completed; i += 1) completed = ecu.parts.checksum.step();
    assert.equal(completed, true);
    assert.equal(ecu.parts.checksum.lastResult?.computed, ROM_CHECKSUM);
  });

  it('decodes the identity blocks outside the checksum coverage', () => {
    const ecu = createEcu();
    const identity = readIdentity(ecu.machine.rom);
    assert.equal(identity.bosch, '0261200175');
    assert.equal(identity.software, '1267356378');
    assert.ok(CODE.identityBlockA > CODE.checksumCoverageEnd);
  });
});

describe('RAM test', () => {
  it('walks page-0 offsets ff down to 01 with 0x55 and 0xaa', () => {
    const ecu = createEcu();
    ecu.powerOn();
    const result = ecu.parts.integrity.testRam();
    assert.equal(result.passed, true);
    assert.equal(result.failedOffset, null);
  });

  it('reports identifier 4532 subtype 1 on the first mismatch', () => {
    const ecu = createEcu();
    ecu.powerOn();
    // A stuck cell: writes to offset 0x40 never take.
    const original = ecu.machine.xram.write.bind(ecu.machine.xram);
    ecu.machine.xram.write = (address: number, value: number): void => {
      if (address === 0x40) return;
      original(address, value);
    };

    const result = ecu.parts.integrity.testRam();
    assert.equal(result.passed, false);
    assert.equal(result.failedOffset, 0x40);

    const record = ecu.parts.faults.find(FAULT_TABLE_IDENTIFIER);
    assert.ok(record);
    assert.equal(ecu.parts.faults.subtypeOf(record), SUBTYPE.ramTest);
  });
});

describe('fault memory', () => {
  it('lays records out as five bytes from XRAM 0300', () => {
    const ecu = createEcu();
    ecu.powerOn();
    ecu.parts.faults.report(0x21, 3, 0xaa, 0xbb);

    assert.equal(ecu.machine.xram.read(XRAM.faultRecordBase), 0x21);
    assert.equal(ecu.machine.xram.read(XRAM.faultRecordBase + 2), 0xaa);
    assert.equal(ecu.machine.xram.read(XRAM.faultRecordBase + 3), 0xbb);
    assert.equal(ecu.machine.xram.read(XRAM.faultCount), 1);
    assert.equal((XRAM.faultRecordEnd - XRAM.faultRecordBase + 1) / RECORD_BYTES, MAX_RECORDS);
  });

  it('sets the proven status bits', () => {
    const ecu = createEcu();
    ecu.powerOn();
    const record = ecu.parts.faults.report(0x21, 5);
    assert.ok(record);
    assert.equal(record.status & 0x0f, 5, 'low nibble is the monitor subtype');
    assert.equal((record.status >> STATUS_BIT.qualifiedStored) & 1, 1);
    assert.equal((record.status >> STATUS_BIT.currentlyActive) & 1, 1);

    ecu.parts.faults.clearActive(0x21);
    const healed = ecu.parts.faults.find(0x21);
    assert.equal((healed!.status >> STATUS_BIT.currentlyActive) & 1, 0);
    assert.equal((healed!.status >> STATUS_BIT.previouslyActive) & 1, 1);
  });

  it('ages inactive records out and refuses to exceed 51 slots', () => {
    const ecu = createEcu();
    ecu.powerOn();
    ecu.parts.faults.report(0x21, 1);
    ecu.parts.faults.clearActive(0x21);
    for (let i = 0; i < 40; i += 1) ecu.parts.faults.age(40);
    assert.equal(ecu.parts.faults.count(), 0);

    for (let i = 0; i < MAX_RECORDS + 5; i += 1) ecu.parts.faults.report(0x30 + i, 1);
    assert.equal(ecu.parts.faults.count(), MAX_RECORDS);
  });

  it('CODE:89c4 clears records, the cache, and adaptation status 002f', () => {
    const ecu = createEcu();
    ecu.powerOn();
    ecu.parts.faults.report(0x21, 1);
    ecu.machine.xram.write(XRAM.adaptationStatus, 0x37);

    ecu.parts.faults.clearAll();
    assert.equal(ecu.parts.faults.count(), 0);
    assert.equal(ecu.machine.xram.read(XRAM.adaptationStatus), 0);
    assert.equal(ecu.machine.xram.read(XRAM.faultCacheBase), 0);
  });
});
