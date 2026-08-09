import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { parseRuntimeBridgeLine } from '../src/parse-runtime-bridge-line.ts';
import { validateRuntimeBridgeCommand } from '../src/validate-runtime-bridge-command.ts';
import { validateRuntimeBridgeResponse } from '../src/validate-runtime-bridge-response.ts';

const advanceCommand = () => ({
  schema: 'motronic-bridge/v1',
  type: 'advance',
  seq: 7,
  fromCycle: 100,
  toCycle: 200,
  events: [
    { cycle: 100, kind: 'xdata', address: 0xa040, value: 0x12 },
    { cycle: 110, kind: 'adc', channel: 0, value: 127 },
    { cycle: 110, kind: 'port', port: 5, value: 0xff },
    { cycle: 120, kind: 'cc0', state: 0 },
    { cycle: 122, kind: 'cc0', state: 1 },
  ],
});

const frameResponse = () => ({
  schema: 'motronic-bridge/v1',
  type: 'frame',
  seq: 7,
  fromCycle: 100,
  toCycle: 200,
  cycle: 200,
  counters: {
    instructions: 61,
    init: 1,
    supervisor: 1,
    foreground: 0,
    timer0: 0,
    timer1: 1,
    timer2: 0,
    capture: 2,
    vector0063: 0,
    vector006b: 0,
    unknownXdataReads: 0,
  },
  telemetry: [
    { cycle: 125, kind: 'p1', bit: 5, state: 0 },
    { cycle: 130, kind: 'sfr-write', address: 0xc4, value: 0x12 },
    { cycle: 140, kind: 'xdata-write', address: 0xa040, value: 0x21 },
  ],
});

describe('runtime bridge schema', () => {
  it('is valid JSON with the exact protocol identity and message variants', () => {
    const text = readFileSync(
      new URL('../contract/runtime-bridge-v1.schema.json', import.meta.url),
      'utf8',
    );
    const schema = JSON.parse(text) as { $id?: unknown; oneOf?: unknown[] };
    assert.equal(schema.$id, 'https://grokathon.local/motronic-bridge/v1');
    assert.equal(schema.oneOf?.length, 6);
  });
});

describe('runtime bridge command validation', () => {
  it('accepts strict peripheral-only commands and bounded lines', () => {
    const command = validateRuntimeBridgeCommand(advanceCommand(), {
      expectedSeq: 7,
      expectedFromCycle: 100,
    });
    assert.equal(command.type, 'advance');
    const parsed = parseRuntimeBridgeLine(
      JSON.stringify({
        schema: 'motronic-bridge/v1',
        type: 'hello',
      }),
      'command',
    );
    assert.equal('type' in parsed && parsed.type, 'hello');
  });

  it('rejects unknown versions, fields, and non-peripheral control', () => {
    assert.throws(
      () => validateRuntimeBridgeCommand({ ...advanceCommand(), schema: 'other/v1' }),
      /schema/,
    );
    assert.throws(
      () => validateRuntimeBridgeCommand({ ...advanceCommand(), pedal: 900 }),
      /not permitted/,
    );
    assert.throws(
      () =>
        validateRuntimeBridgeCommand({
          schema: 'motronic-bridge/v1',
          type: 'hello',
          rpm: 850,
        }),
      /not permitted/,
    );
  });

  it('rejects sequence gaps, cycle gaps or overlaps, and oversized windows', () => {
    assert.throws(
      () => validateRuntimeBridgeCommand(advanceCommand(), { expectedSeq: 8 }),
      /expected 8/,
    );
    assert.throws(
      () => validateRuntimeBridgeCommand(advanceCommand(), { expectedFromCycle: 99 }),
      /gap or overlap/,
    );
    assert.throws(
      () =>
        validateRuntimeBridgeCommand({
          ...advanceCommand(),
          toCycle: 12_000_101,
        }),
      /exceeds/,
    );
  });

  it('rejects late, non-monotonic, invalid, and oversized events', () => {
    const late = advanceCommand();
    late.events[0]!.cycle = 99;
    assert.throws(() => validateRuntimeBridgeCommand(late), /outside/);

    const backward = advanceCommand();
    backward.events[2]!.cycle = 109;
    assert.throws(() => validateRuntimeBridgeCommand(backward), /nondecreasing/);

    const invalidAddress = advanceCommand();
    invalidAddress.events[0]!.address = 0xa100;
    assert.throws(() => validateRuntimeBridgeCommand(invalidAddress), /address/);

    const invalidAdc = advanceCommand();
    invalidAdc.events[1]!.value = 128;
    assert.throws(() => validateRuntimeBridgeCommand(invalidAdc), /value/);

    const oversized = advanceCommand();
    oversized.events = Array.from({ length: 4_097 }, () => ({
      cycle: 100,
      kind: 'cc0',
      state: 1,
    }));
    assert.throws(() => validateRuntimeBridgeCommand(oversized), /4096/);
    assert.throws(
      () => parseRuntimeBridgeLine(`"${'x'.repeat(1_048_576)}"`, 'command'),
      /exceeds/,
    );
  });
});

describe('runtime bridge response validation', () => {
  it('accepts identity, counters, and cycle-tagged telemetry responses', () => {
    assert.equal(
      validateRuntimeBridgeResponse({
        schema: 'motronic-bridge/v1',
        type: 'ready',
        cycle: 0,
        nextSeq: 0,
        romSha256: 'e'.repeat(64),
        mameCommit: 'a'.repeat(40),
        limits: {
          maxEvents: 4_096,
          maxBatchCycles: 12_000_000,
        },
      }).type,
      'ready',
    );
    assert.equal(
      validateRuntimeBridgeResponse(frameResponse(), {
        expectedSeq: 7,
        expectedFromCycle: 100,
      }).type,
      'frame',
    );
  });

  it('rejects invalid telemetry ordering and frame boundaries', () => {
    const backward = frameResponse();
    backward.telemetry[2]!.cycle = 129;
    assert.throws(() => validateRuntimeBridgeResponse(backward), /nondecreasing/);

    const boundary = frameResponse();
    boundary.telemetry[0]!.cycle = 201;
    assert.throws(() => validateRuntimeBridgeResponse(boundary), /outside/);
  });

  it('requires fatal structured errors and rejects extra response fields', () => {
    assert.equal(
      validateRuntimeBridgeResponse({
        schema: 'motronic-bridge/v1',
        type: 'error',
        fatal: true,
        message: 'client stopped responding',
      }).type,
      'error',
    );
    assert.throws(
      () => validateRuntimeBridgeResponse({ ...frameResponse(), hidden: true }),
      /not permitted/,
    );
  });
});
