/**
 * Diagnostic services.
 *
 * SPECS lists what was recovered: "five-block identity transfer, memory/SFR
 * read, code-space read, programming operations, fault-record pagination,
 * indexed runtime data, secondary fixed blocks, and fault clear", plus the six
 * actuator requests decoded at 8bac, and the primary identity blocks at 9f02
 * and 9f0c decoding to Bosch/DME 0261200175 and software 1267356378.
 *
 * The service *codes* are not published by the specification — "Unknown:
 * complete command dictionary, block fields" — so the byte values below are
 * model-assigned and marked as such. The behaviours are the recovered ones.
 */

import { CODE, IDENTITY } from '../memory-map.ts';
import { identityBlock } from '../rom-image.ts';
import { MAX_BLOCK_LENGTH } from './kw71-framing.ts';
import type { EcuContext } from '../context.ts';
import type { FaultMemory } from '../subsystems/fault-memory.ts';
import type { SensorState } from '../subsystems/sensor-state.ts';
import type { ActuatorTests } from './kw71-actuators.ts';

/** Model-assigned service codes. Names are recovered; values are not. */
export const SERVICE = {
  identity: 0x00,
  readMemory: 0x01,
  readCode: 0x02,
  programming: 0x03,
  faultPage: 0x04,
  runtimeData: 0x05,
  fixedBlock: 0x06,
  clearFaults: 0x07,
  actuatorTest: 0x08,
  stopActuator: 0x09,
} as const;

/** Five identity blocks, the first two of which decode to known numbers. */
export const IDENTITY_BLOCKS = 5;

export interface ServiceResponse {
  service: number;
  payload: number[];
  /** Set when a request was refused rather than answered. */
  rejected?: string;
}

export interface ServiceDependencies {
  context: EcuContext;
  faults: FaultMemory;
  sensors: SensorState;
  actuators: ActuatorTests;
}

const bcdDigits = (text: string): number[] => {
  const out: number[] = [];
  for (let i = 0; i < text.length; i += 2) {
    out.push((Number(text[i]) << 4) | Number(text[i + 1]));
  }
  return out;
};

export const handleService = (
  deps: ServiceDependencies,
  service: number,
  payload: readonly number[],
): ServiceResponse => {
  const { context, faults, sensors, actuators } = deps;
  const { machine } = context;

  switch (service) {
    case SERVICE.identity: {
      const index = payload[0] ?? 0;
      if (index >= IDENTITY_BLOCKS) {
        return { service, payload: [], rejected: 'identity block index out of range' };
      }
      if (index === 0) return { service, payload: bcdDigits(IDENTITY.boschNumber) };
      if (index === 1) return { service, payload: bcdDigits(IDENTITY.softwareNumber) };
      // The remaining three blocks exist; their content is not recovered.
      return { service, payload: [index, 0, 0, 0, 0] };
    }

    case SERVICE.readMemory: {
      const address = ((payload[0] ?? 0) << 8) | (payload[1] ?? 0);
      const length = Math.min(payload[2] ?? 1, MAX_BLOCK_LENGTH);
      const bytes: number[] = [];
      for (let i = 0; i < length; i += 1) {
        // Addresses at or above 0x80 in the low page are read as SFRs, matching
        // the "memory/SFR read" description; everything else is XRAM.
        bytes.push(address < 0x0100 && address >= 0x80
          ? machine.sfr.read(address + i)
          : machine.xram.read(address + i));
      }
      return { service, payload: bytes };
    }

    case SERVICE.readCode: {
      const address = ((payload[0] ?? 0) << 8) | (payload[1] ?? 0);
      const length = Math.min(payload[2] ?? 1, MAX_BLOCK_LENGTH);
      const bytes: number[] = [];
      for (let i = 0; i < length; i += 1) bytes.push(machine.rom[(address + i) % CODE.imageEnd]);
      return { service, payload: bytes };
    }

    case SERVICE.programming:
      // SPECS records that programming operations exist. Writing code space is
      // not something this model will do on a guessed command encoding.
      return { service, payload: [], rejected: 'programming operations not implemented' };

    case SERVICE.faultPage: {
      const page = payload[0] ?? 0;
      const perPage = 3;
      const records = faults.all().slice(page * perPage, page * perPage + perPage);
      const bytes: number[] = [faults.count()];
      for (const record of records) {
        bytes.push(record.identifier, record.status, record.snapshotA, record.snapshotB);
      }
      return { service, payload: bytes.slice(0, MAX_BLOCK_LENGTH) };
    }

    case SERVICE.runtimeData: {
      const index = payload[0] ?? 0;
      const summary = sensors.summary();
      const keys = Object.keys(summary);
      const key = keys[index % keys.length];
      const entry = summary[key];
      const raw = typeof entry === 'number' ? entry & 0xff : entry.raw;
      return { service, payload: [index, raw] };
    }

    case SERVICE.fixedBlock:
      return { service, payload: [0x01, 0x02, 0x03, 0x04] };

    case SERVICE.clearFaults:
      faults.clearAll();
      return { service, payload: [0x00] };

    case SERVICE.actuatorTest: {
      const code = payload[0] ?? 0;
      return actuators.accept(code)
        ? { service, payload: [code] }
        : { service, payload: [code], rejected: 'unknown actuator request' };
    }

    case SERVICE.stopActuator:
      actuators.stopAll();
      return { service, payload: [] };

    default:
      return { service, payload: [], rejected: 'unknown service' };
  }
};

/** Decoded identity, read back out of the ROM image the way the service does. */
export const readIdentity = (rom: Uint8Array): { bosch: string; software: string } => ({
  bosch: identityBlock(rom, CODE.identityBlockA, 10),
  software: identityBlock(rom, CODE.identityBlockB, 10),
});
