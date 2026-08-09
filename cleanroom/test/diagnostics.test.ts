/** KW71-style serial diagnostics. */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { createEcu, type Ecu } from '../src/ecu.ts';
import { IDATA, XRAM } from '../src/memory-map.ts';
import {
  BLOCK_TERMINATOR,
  HANDSHAKE_BYTE,
  MAX_BLOCK_LENGTH,
  SYNC_BYTE,
  complement,
  isAcceptableLength,
  isValidEcho,
  parseBlock,
  serializeBlock,
} from '../src/diagnostics/kw71-framing.ts';
import { PHASE } from '../src/diagnostics/kw71-session.ts';
import { ACTUATOR_REQUESTS } from '../src/diagnostics/kw71-actuators.ts';
import { SERVICE } from '../src/diagnostics/kw71-services.ts';

/** Bring a session up to the point where it accepts blocks. */
const connected = (): Ecu => {
  const ecu = createEcu();
  ecu.powerOn();
  ecu.runFor(20);
  ecu.receiveDiagnosticByte(HANDSHAKE_BYTE);
  ecu.runFor(20);
  return ecu;
};

/** One foreground cycle per byte: the session consumes one byte per pass. */
const send = (ecu: Ecu, bytes: number[]): void => {
  for (const byte of bytes) {
    ecu.receiveDiagnosticByte(byte);
    ecu.runFor(12);
  }
};

describe('framing', () => {
  it('accepts a length byte no greater than 0x10', () => {
    assert.equal(MAX_BLOCK_LENGTH, 0x10);
    assert.equal(isAcceptableLength(0x10), true);
    assert.equal(isAcceptableLength(0x11), false);
    assert.equal(isAcceptableLength(0), false);
  });

  it('verifies a received byte against the complement of the previous one', () => {
    assert.equal(complement(0x55), 0xaa);
    assert.equal(isValidEcho(0xaa, 0x55), true);
    assert.equal(isValidEcho(0x55, 0x55), false);
  });

  it('round-trips a block with its trailing 0x03', () => {
    const bytes = serializeBlock({ length: 5, sequence: 1, service: 2, payload: [9, 9] });
    assert.equal(bytes[bytes.length - 1], BLOCK_TERMINATOR);
    const parsed = parseBlock(bytes.slice(1));
    assert.deepEqual(parsed, { sequence: 1, service: 2, payload: [9, 9] });
  });
});

describe('handshake', () => {
  it('transmits synchronisation 0x55 from state 0', () => {
    const ecu = createEcu();
    ecu.powerOn();
    ecu.runFor(20);

    assert.equal(ecu.machine.serial.txLog[0], SYNC_BYTE);
    assert.equal(ecu.machine.idata.read(IDATA.diagPhase), PHASE.keyword);
  });

  it('answers a keyword byte with its complement', () => {
    const ecu = createEcu();
    ecu.powerOn();
    ecu.runFor(20);
    send(ecu, [0x7f]);

    const log = ecu.machine.serial.txLog;
    assert.equal(log[log.length - 1], complement(0x7f));
  });

  it('advances on 0x06 (CODE:774f)', () => {
    const ecu = connected();
    assert.equal(ecu.machine.idata.read(IDATA.diagPhase), PHASE.ready);
  });
});

describe('block exchange', () => {
  it('rolls back the state machine on an over-length block', () => {
    const ecu = connected();
    send(ecu, [0x11]);
    assert.equal(ecu.machine.idata.read(IDATA.diagPhase), PHASE.sync);
  });

  it('stores the byte, decrements the remaining length, and echoes the complement', () => {
    const ecu = connected();
    send(ecu, [0x04]);
    assert.equal(ecu.machine.idata.read(IDATA.diagRemainingLength), 0x04);
    assert.equal(ecu.machine.serial.txLog.at(-1), complement(0x04));

    send(ecu, [0x01]);
    assert.equal(ecu.machine.idata.read(IDATA.diagRemainingLength), 0x03);
    assert.equal(ecu.machine.idata.read(IDATA.diagDataPointer), 1);
    assert.equal(ecu.machine.serial.txLog.at(-1), complement(0x01));
  });

  it('answers a completed block through XRAM 00b1-00b4 with a trailing 0x03', () => {
    const ecu = connected();
    send(ecu, [0x04, 0x01, SERVICE.identity, 0x00, BLOCK_TERMINATOR]);

    assert.equal(ecu.machine.xram.read(XRAM.diagFrameService), SERVICE.identity);
    assert.equal(ecu.machine.xram.read(XRAM.diagFrameSequence), 0x02);
    assert.equal(ecu.machine.serial.txLog.at(-1), BLOCK_TERMINATOR);

    const length = ecu.machine.xram.read(XRAM.diagFrameLength);
    const payload = Array.from({ length: length - 3 }, (_, i) =>
      ecu.machine.xram.read(XRAM.diagFramePayload + i),
    );
    // Bosch/DME 0261200175, packed BCD.
    assert.deepEqual(payload, [0x02, 0x61, 0x20, 0x01, 0x75]);
  });

  it('records the service byte at INTMEM:0033', () => {
    const ecu = connected();
    send(ecu, [0x04, 0x01, SERVICE.clearFaults, 0x00, BLOCK_TERMINATOR]);
    assert.equal(ecu.machine.idata.read(IDATA.diagCommand), SERVICE.clearFaults);
  });
});

describe('timeouts', () => {
  it('decrements INTMEM:0032 and calls 8943 on expiry', () => {
    const ecu = connected();
    const before = ecu.machine.idata.read(IDATA.diagTimeout);
    ecu.runFor(30);
    assert.ok(ecu.machine.idata.read(IDATA.diagTimeout) < before);

    const sent = ecu.machine.serial.txLog.length;
    ecu.runFor(2000);
    // Rolled back out of the connected state and re-announcing itself.
    assert.notEqual(ecu.machine.idata.read(IDATA.diagPhase), PHASE.ready);
    assert.ok(ecu.machine.serial.txLog.slice(sent).includes(SYNC_BYTE));
  });

  it('re-enters initialisation only under the specific runtime condition', () => {
    const ecu = connected();
    ecu.parts.uart.reinitialiseOnTimeout = true;
    ecu.machine.idata.write(IDATA.diagTimeout, 1);
    ecu.runFor(2000);
    assert.ok(ecu.restarts.includes('serial-timeout-8943'));
  });
});

describe('actuator tests', () => {
  it('decodes exactly the six recovered request codes', () => {
    assert.deepEqual(
      ACTUATOR_REQUESTS.map((r) => r.code).sort((a, b) => a - b),
      [0x03, 0x1d, 0x20, 0x24, 0x25, 0x30],
    );
  });

  it('accepts a known request and rejects an unknown one', () => {
    const ecu = createEcu();
    ecu.powerOn();
    assert.equal(ecu.parts.actuators.accept(0x1d), true);
    assert.equal(ecu.parts.actuators.accept(0x99), false);
  });

  it('drives its target from the periodic service at 8000', () => {
    const ecu = createEcu();
    ecu.powerOn();
    ecu.parts.actuators.accept(0x03);
    ecu.runFor(30);

    const driven = ecu.machine.events.filter((e) => e.kind === 'actuator-test');
    assert.ok(driven.length > 0);
    assert.match(driven[0].channel, /P1\.3/);
  });
});

describe('services', () => {
  it('clears fault memory on request', () => {
    const ecu = connected();
    ecu.parts.faults.report(0x21, 1);
    send(ecu, [0x03, 0x01, SERVICE.clearFaults, BLOCK_TERMINATOR]);
    assert.equal(ecu.parts.faults.count(), 0);
  });

  it('refuses programming operations rather than guessing an encoding', () => {
    const ecu = connected();
    const before = [...ecu.machine.rom.slice(0, 4)];
    send(ecu, [0x04, 0x01, SERVICE.programming, 0x00, BLOCK_TERMINATOR]);
    assert.deepEqual([...ecu.machine.rom.slice(0, 4)], before);
  });
});
