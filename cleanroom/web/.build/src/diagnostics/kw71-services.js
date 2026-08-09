"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.readIdentity = exports.handleService = exports.IDENTITY_BLOCKS = exports.SERVICE = void 0;
const memory_map_ts_1 = require("../memory-map.js");
const rom_image_ts_1 = require("../rom-image.js");
const kw71_framing_ts_1 = require("./kw71-framing.js");
/** Model-assigned service codes. Names are recovered; values are not. */
exports.SERVICE = {
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
};
/** Five identity blocks, the first two of which decode to known numbers. */
exports.IDENTITY_BLOCKS = 5;
const bcdDigits = (text) => {
    const out = [];
    for (let i = 0; i < text.length; i += 2) {
        out.push((Number(text[i]) << 4) | Number(text[i + 1]));
    }
    return out;
};
const handleService = (deps, service, payload) => {
    const { context, faults, sensors, actuators } = deps;
    const { machine } = context;
    switch (service) {
        case exports.SERVICE.identity: {
            const index = payload[0] ?? 0;
            if (index >= exports.IDENTITY_BLOCKS) {
                return { service, payload: [], rejected: 'identity block index out of range' };
            }
            if (index === 0)
                return { service, payload: bcdDigits(memory_map_ts_1.IDENTITY.boschNumber) };
            if (index === 1)
                return { service, payload: bcdDigits(memory_map_ts_1.IDENTITY.softwareNumber) };
            // The remaining three blocks exist; their content is not recovered.
            return { service, payload: [index, 0, 0, 0, 0] };
        }
        case exports.SERVICE.readMemory: {
            const address = ((payload[0] ?? 0) << 8) | (payload[1] ?? 0);
            const length = Math.min(payload[2] ?? 1, kw71_framing_ts_1.MAX_BLOCK_LENGTH);
            const bytes = [];
            for (let i = 0; i < length; i += 1) {
                // Addresses at or above 0x80 in the low page are read as SFRs, matching
                // the "memory/SFR read" description; everything else is XRAM.
                bytes.push(address < 0x0100 && address >= 0x80
                    ? machine.sfr.read(address + i)
                    : machine.xram.read(address + i));
            }
            return { service, payload: bytes };
        }
        case exports.SERVICE.readCode: {
            const address = ((payload[0] ?? 0) << 8) | (payload[1] ?? 0);
            const length = Math.min(payload[2] ?? 1, kw71_framing_ts_1.MAX_BLOCK_LENGTH);
            const bytes = [];
            for (let i = 0; i < length; i += 1)
                bytes.push(machine.rom[(address + i) % memory_map_ts_1.CODE.imageEnd]);
            return { service, payload: bytes };
        }
        case exports.SERVICE.programming:
            // SPECS records that programming operations exist. Writing code space is
            // not something this model will do on a guessed command encoding.
            return { service, payload: [], rejected: 'programming operations not implemented' };
        case exports.SERVICE.faultPage: {
            const page = payload[0] ?? 0;
            const perPage = 3;
            const records = faults.all().slice(page * perPage, page * perPage + perPage);
            const bytes = [faults.count()];
            for (const record of records) {
                bytes.push(record.identifier, record.status, record.snapshotA, record.snapshotB);
            }
            return { service, payload: bytes.slice(0, kw71_framing_ts_1.MAX_BLOCK_LENGTH) };
        }
        case exports.SERVICE.runtimeData: {
            const index = payload[0] ?? 0;
            const summary = sensors.summary();
            const keys = Object.keys(summary);
            const key = keys[index % keys.length];
            const entry = summary[key];
            const raw = typeof entry === 'number' ? entry & 0xff : entry.raw;
            return { service, payload: [index, raw] };
        }
        case exports.SERVICE.fixedBlock:
            return { service, payload: [0x01, 0x02, 0x03, 0x04] };
        case exports.SERVICE.clearFaults:
            faults.clearAll();
            return { service, payload: [0x00] };
        case exports.SERVICE.actuatorTest: {
            const code = payload[0] ?? 0;
            return actuators.accept(code)
                ? { service, payload: [code] }
                : { service, payload: [code], rejected: 'unknown actuator request' };
        }
        case exports.SERVICE.stopActuator:
            actuators.stopAll();
            return { service, payload: [] };
        default:
            return { service, payload: [], rejected: 'unknown service' };
    }
};
exports.handleService = handleService;
/** Decoded identity, read back out of the ROM image the way the service does. */
const readIdentity = (rom) => ({
    bosch: (0, rom_image_ts_1.identityBlock)(rom, memory_map_ts_1.CODE.identityBlockA, 10),
    software: (0, rom_image_ts_1.identityBlock)(rom, memory_map_ts_1.CODE.identityBlockB, 10),
});
exports.readIdentity = readIdentity;
