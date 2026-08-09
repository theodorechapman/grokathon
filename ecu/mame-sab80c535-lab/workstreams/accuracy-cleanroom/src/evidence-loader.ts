import { readFileSync } from 'node:fs';

import type { EvidenceBundle } from './audit-types.ts';
import { PATHS } from './paths.ts';

type JsonRecord = Record<string, unknown>;

const object = (value: unknown, label: string): JsonRecord => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} is not an object`);
  }
  return value as JsonRecord;
};

const array = (value: unknown, label: string): unknown[] => {
  if (!Array.isArray(value)) throw new Error(`${label} is not an array`);
  return value;
};

const text = (value: unknown, label: string): string => {
  if (typeof value !== 'string') throw new Error(`${label} is not a string`);
  return value;
};

const integer = (value: unknown, label: string): number => {
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new Error(`${label} is not an integer`);
  return value;
};

const json = (path: string): JsonRecord => object(JSON.parse(readFileSync(path, 'utf8')), path);

const address = (value: unknown, label: string): number => {
  const raw = text(value, label);
  const match = raw.match(/^(?:CODE|SFR):([0-9a-f]{4})$/i);
  if (!match) throw new Error(`${label} is not a CODE/SFR address: ${raw}`);
  return Number.parseInt(match[1], 16);
};

const loadMameReset = (expectedHash: string): string[] => {
  const path = `${PATHS.validationStimuli}logs/reset-events.ndjson`;
  const events = readFileSync(path, 'utf8').trim().split(/\r?\n/).map((line) => object(JSON.parse(line), path));
  const provenance = events[0];
  if (provenance.kind !== 'provenance' || provenance.runtime !== true) {
    throw new Error('MAME reset trace is not runtime-qualified');
  }
  if (provenance.rom_sha256 !== expectedHash) throw new Error('MAME reset trace canonical ROM hash mismatch');
  return events
    .filter((event) => event.kind === 'pc')
    .map((event, index) => text(event.pc, `MAME pc ${index}`).toLowerCase());
};

export const loadEvidence = (): EvidenceBundle => {
  const manifest = json(`${PATHS.e2e}manifest.json`);
  const canonical = object(manifest.canonical_image, 'manifest canonical_image');
  const canonicalHash = text(canonical.sha256, 'canonical sha256');

  const validation = json(`${PATHS.e2e}traces/validation-summary.json`);
  const reset = object(validation.reset, 'validation reset');
  if (reset.passed !== true) throw new Error('e2e reset evidence is not passing');
  const resetPath = array(reset.actual, 'validation reset actual').map((entry, index) =>
    text(entry, `reset actual ${index}`).replace('CODE:', '').toLowerCase(),
  );
  const mamePcs = loadMameReset(canonicalHash);
  if (resetPath.some((pc, index) => mamePcs[index] !== pc)) {
    throw new Error('Ghidra and MAME reset paths disagree');
  }

  const hardware = json(`${PATHS.e2e}hardware-model.json`);
  const aliases: Record<string, string> = { external_3: 'ext3cc0', external_0: 'ext0', external_1: 'ext1', external_2: 'ext2', external_4: 'ext4', external_5: 'ext5', external_6: 'ext6', timer_0: 'timer0', timer_1: 'timer1', timer_2: 'timer2' };
  const vectors: EvidenceBundle['vectors'] = {};
  for (const [index, raw] of array(hardware.vectors, 'hardware vectors').entries()) {
    const vector = object(raw, `vector ${index}`);
    const rawName = text(vector.name, `vector ${index} name`);
    const name = aliases[rawName] ?? rawName;
    const targets = array(vector.direct_targets, `vector ${index} targets`);
    vectors[name] = {
      vector: address(vector.vector, `vector ${index} address`),
      wrapper: targets.length === 0 ? null : address(targets[0], `vector ${index} target`),
    };
  }

  const sfr: Record<string, number> = {};
  for (const [index, raw] of array(hardware.peripherals, 'hardware peripherals').entries()) {
    const peripheral = object(raw, `peripheral ${index}`);
    sfr[text(peripheral.name, `peripheral ${index} name`)] = address(
      peripheral.address,
      `peripheral ${index} address`,
    );
  }

  const calibration = json(`${PATHS.e2e}calibration-index.json`);
  const integrity = json(`${PATHS.e2e}integrity.json`);
  const storedChecksum = object(integrity.stored_candidate, 'stored checksum');
  const calculations = object(integrity.calculations, 'checksum calculations');
  const coveredSum = object(calculations.sum16_CODE_0000_9eff, 'covered checksum sum');
  const scenarios = json(`${PATHS.e2e}traces/scenarios.json`);
  const overRev = array(scenarios.scenarios, 'e2e scenarios')
    .map((entry, index) => object(entry, `scenario ${index}`))
    .find((entry) => entry.name === 'over_rev');
  if (!overRev) throw new Error('over_rev evidence fixture is unavailable');
  const records = object(overRev.rev_limit_records, 'over_rev records');
  const primary = object(records.primary, 'primary rev record');
  const secondary = object(records.secondary, 'secondary rev record');

  const outputEndpoints: Record<string, string> = {};
  for (const [index, raw] of array(hardware.logical_endpoints, 'logical endpoints').entries()) {
    const endpoint = object(raw, `endpoint ${index}`);
    outputEndpoints[text(endpoint.name, `endpoint ${index} name`)] = text(
      endpoint.endpoint,
      `endpoint ${index} value`,
    );
  }

  return {
    canonicalHash,
    resetPath,
    vectors,
    sfr,
    masterDirectory: {
      base: integer(calibration.table_address, 'master directory base'),
      entries: integer(calibration.pointer_count, 'master directory count'),
    },
    checksum: {
      address: address(storedChecksum.cpu_address, 'checksum address'),
      value: integer(coveredSum.value, 'covered checksum value'),
      coverageEnd: 0x9f00,
    },
    revLimit: {
      primary: address(primary.address, 'primary limit address'),
      secondary: address(secondary.address, 'secondary limit address'),
      limit: integer(primary.raw, 'primary limit byte'),
      buffer: integer(primary.buffer_raw, 'primary buffer byte'),
    },
    outputEndpoints,
  };
};
