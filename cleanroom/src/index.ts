/**
 * Clean-room Motronic 1.7 (SAB80C515) engine controller.
 *
 * Built from SPECS.md alone: no original binary, disassembly, XDF, or analysis
 * artefact was consulted. Where the specification proves a fact, this model
 * reproduces it at the address the specification gives. Where the specification
 * says "unknown", the value lives in `assumptions.ts` and is disclosed.
 */

export { Ecu, createEcu, type EcuOptions } from './ecu.ts';
export {
  DEFAULT_ASSUMPTIONS,
  ASSUMPTION_BASIS,
  SPEC_PROVEN,
  timerClockHz,
  msToTicks,
  ticksToMs,
  type Assumptions,
} from './assumptions.ts';
export { BITS, CODE, IDATA, IDENTITY, ROM_CHECKSUM, SFR, XRAM } from './memory-map.ts';
export type {
  CaptureEvent,
  Confidence,
  FaultRecord,
  FuelResult,
  IdleResult,
  IgnitionResult,
  InterruptSource,
  LimiterState,
  OutputEvent,
  Scaled,
  Ticks,
} from './types.ts';
export { RESET_TRACE } from './kernel/reset.ts';
export { VECTOR_TABLE, vectorFor } from './kernel/vector-table.ts';
export { PAYLOAD_CATALOG } from './calibration/payload-catalog.ts';
export { REV_LIMIT } from './calibration/rev-limit-record.ts';
export {
  LOOKUP_CONFIGURATIONS,
  MODE_VARIANT_BASES,
  SELECTOR_TABLES,
} from './calibration/selector-tables.ts';
export { ACTUATOR_REQUESTS } from './diagnostics/kw71-actuators.ts';
export { SERVICE, readIdentity } from './diagnostics/kw71-services.ts';
export { PHASE } from './diagnostics/kw71-session.ts';
export { MAX_BLOCK_LENGTH, complement, serializeBlock } from './diagnostics/kw71-framing.ts';
export { disclosure } from './disclosure.ts';
