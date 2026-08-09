"use strict";
/**
 * Clean-room Motronic 1.7 (SAB80C515) engine controller.
 *
 * Built from SPECS.md alone: no original binary, disassembly, XDF, or analysis
 * artefact was consulted. Where the specification proves a fact, this model
 * reproduces it at the address the specification gives. Where the specification
 * says "unknown", the value lives in `assumptions.ts` and is disclosed.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.disclosure = exports.serializeBlock = exports.complement = exports.MAX_BLOCK_LENGTH = exports.PHASE = exports.readIdentity = exports.SERVICE = exports.ACTUATOR_REQUESTS = exports.SELECTOR_TABLES = exports.MODE_VARIANT_BASES = exports.LOOKUP_CONFIGURATIONS = exports.REV_LIMIT = exports.PAYLOAD_CATALOG = exports.vectorFor = exports.VECTOR_TABLE = exports.RESET_TRACE = exports.XRAM = exports.SFR = exports.ROM_CHECKSUM = exports.IDENTITY = exports.IDATA = exports.CODE = exports.BITS = exports.ticksToMs = exports.msToTicks = exports.timerClockHz = exports.SPEC_PROVEN = exports.ASSUMPTION_BASIS = exports.DEFAULT_ASSUMPTIONS = exports.createEcu = exports.Ecu = void 0;
var ecu_ts_1 = require("./ecu.js");
Object.defineProperty(exports, "Ecu", { enumerable: true, get: function () { return ecu_ts_1.Ecu; } });
Object.defineProperty(exports, "createEcu", { enumerable: true, get: function () { return ecu_ts_1.createEcu; } });
var assumptions_ts_1 = require("./assumptions.js");
Object.defineProperty(exports, "DEFAULT_ASSUMPTIONS", { enumerable: true, get: function () { return assumptions_ts_1.DEFAULT_ASSUMPTIONS; } });
Object.defineProperty(exports, "ASSUMPTION_BASIS", { enumerable: true, get: function () { return assumptions_ts_1.ASSUMPTION_BASIS; } });
Object.defineProperty(exports, "SPEC_PROVEN", { enumerable: true, get: function () { return assumptions_ts_1.SPEC_PROVEN; } });
Object.defineProperty(exports, "timerClockHz", { enumerable: true, get: function () { return assumptions_ts_1.timerClockHz; } });
Object.defineProperty(exports, "msToTicks", { enumerable: true, get: function () { return assumptions_ts_1.msToTicks; } });
Object.defineProperty(exports, "ticksToMs", { enumerable: true, get: function () { return assumptions_ts_1.ticksToMs; } });
var memory_map_ts_1 = require("./memory-map.js");
Object.defineProperty(exports, "BITS", { enumerable: true, get: function () { return memory_map_ts_1.BITS; } });
Object.defineProperty(exports, "CODE", { enumerable: true, get: function () { return memory_map_ts_1.CODE; } });
Object.defineProperty(exports, "IDATA", { enumerable: true, get: function () { return memory_map_ts_1.IDATA; } });
Object.defineProperty(exports, "IDENTITY", { enumerable: true, get: function () { return memory_map_ts_1.IDENTITY; } });
Object.defineProperty(exports, "ROM_CHECKSUM", { enumerable: true, get: function () { return memory_map_ts_1.ROM_CHECKSUM; } });
Object.defineProperty(exports, "SFR", { enumerable: true, get: function () { return memory_map_ts_1.SFR; } });
Object.defineProperty(exports, "XRAM", { enumerable: true, get: function () { return memory_map_ts_1.XRAM; } });
var reset_ts_1 = require("./kernel/reset.js");
Object.defineProperty(exports, "RESET_TRACE", { enumerable: true, get: function () { return reset_ts_1.RESET_TRACE; } });
var vector_table_ts_1 = require("./kernel/vector-table.js");
Object.defineProperty(exports, "VECTOR_TABLE", { enumerable: true, get: function () { return vector_table_ts_1.VECTOR_TABLE; } });
Object.defineProperty(exports, "vectorFor", { enumerable: true, get: function () { return vector_table_ts_1.vectorFor; } });
var payload_catalog_ts_1 = require("./calibration/payload-catalog.js");
Object.defineProperty(exports, "PAYLOAD_CATALOG", { enumerable: true, get: function () { return payload_catalog_ts_1.PAYLOAD_CATALOG; } });
var rev_limit_record_ts_1 = require("./calibration/rev-limit-record.js");
Object.defineProperty(exports, "REV_LIMIT", { enumerable: true, get: function () { return rev_limit_record_ts_1.REV_LIMIT; } });
var selector_tables_ts_1 = require("./calibration/selector-tables.js");
Object.defineProperty(exports, "LOOKUP_CONFIGURATIONS", { enumerable: true, get: function () { return selector_tables_ts_1.LOOKUP_CONFIGURATIONS; } });
Object.defineProperty(exports, "MODE_VARIANT_BASES", { enumerable: true, get: function () { return selector_tables_ts_1.MODE_VARIANT_BASES; } });
Object.defineProperty(exports, "SELECTOR_TABLES", { enumerable: true, get: function () { return selector_tables_ts_1.SELECTOR_TABLES; } });
var kw71_actuators_ts_1 = require("./diagnostics/kw71-actuators.js");
Object.defineProperty(exports, "ACTUATOR_REQUESTS", { enumerable: true, get: function () { return kw71_actuators_ts_1.ACTUATOR_REQUESTS; } });
var kw71_services_ts_1 = require("./diagnostics/kw71-services.js");
Object.defineProperty(exports, "SERVICE", { enumerable: true, get: function () { return kw71_services_ts_1.SERVICE; } });
Object.defineProperty(exports, "readIdentity", { enumerable: true, get: function () { return kw71_services_ts_1.readIdentity; } });
var kw71_session_ts_1 = require("./diagnostics/kw71-session.js");
Object.defineProperty(exports, "PHASE", { enumerable: true, get: function () { return kw71_session_ts_1.PHASE; } });
var kw71_framing_ts_1 = require("./diagnostics/kw71-framing.js");
Object.defineProperty(exports, "MAX_BLOCK_LENGTH", { enumerable: true, get: function () { return kw71_framing_ts_1.MAX_BLOCK_LENGTH; } });
Object.defineProperty(exports, "complement", { enumerable: true, get: function () { return kw71_framing_ts_1.complement; } });
Object.defineProperty(exports, "serializeBlock", { enumerable: true, get: function () { return kw71_framing_ts_1.serializeBlock; } });
var disclosure_ts_1 = require("./disclosure.js");
Object.defineProperty(exports, "disclosure", { enumerable: true, get: function () { return disclosure_ts_1.disclosure; } });
