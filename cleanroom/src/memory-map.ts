/**
 * Address map recovered by the specification.
 *
 * Every named location here appears verbatim in SPECS.md. Nothing is invented:
 * if the spec did not give an address, this file does not name one. All runtime
 * state in the model is stored at these addresses so a test can assert on the
 * memory image, not just on a JavaScript field.
 */

/** Internal (direct-addressable) data memory — the spec's `INTMEM:` space. */
export const IDATA = {
  /** Interrupt-maintained counters; units unknown. */
  interruptCounterLow: 0x16,
  interruptCounterHigh: 0x17,

  /** KW71 diagnostic state machine. */
  diagDataPointer: 0x30,
  diagRemainingLength: 0x31,
  diagTimeout: 0x32,
  diagCommand: 0x33,
  diagPhase: 0x34,
  diagByte: 0x35,

  /** ADC scan destinations, CODE:9e88 writes channels 1..5 here. */
  adcChannel1: 0x36,
  adcChannel2: 0x37,
  adcChannel3: 0x38,
  adcChannel4: 0x39,
  adcChannel5: 0x3a,

  /** Named normalized state (medium confidence in SPECS). */
  scaledSupplyVoltage: 0x36,
  intakeAirTemperature: 0x37,
  coolantTemperature: 0x38,
  hystereticChannel: 0x39,
  unresolvedChannel: 0x3a,
  encodedEngineSpeed: 0x3b,

  /** Timer-2 overflow epoch, incremented by the timer-2 wrapper at 2070. */
  timer2OverflowEpoch: 0x3f,

  normalizedLoad: 0x40,
  filteredAirMassHigh: 0x41,
  filteredAirMassLow: 0x42,

  /** Capture phase counter and timestamp-buffer write pointer (CODE:2462). */
  capturePhase: 0x48,
  captureAltState: 0x4a,
  timestampPointer: 0x4f,

  /** Rev-limit transition countdown loaded from record offset 0x12. */
  revCutCountdown: 0x52,

  /** Composite adaptive correction (CODE:678e chain output). */
  adaptationCompositeA: 0x57,
  adaptationCompositeB: 0x58,
  adaptationCompositeC: 0x59,

  /** Timer-1 supervision heartbeat; expiry reaches restart. */
  heartbeat: 0x68,

  syncState: 0x71,

  /** Lookup configuration windows written by CODE:7930-7c0c. */
  pointerWindowLow: 0x73,
  pointerWindowHigh: 0x74,
  selectorTableLow: 0x75,
  selectorTableHigh: 0x76,

  /** Overrun/deceleration latch timer (CODE:3723). */
  overrunTimer: 0xa0,
} as const;

/** Bit-addressable space — the spec's `BITS:` addresses. */
export const BITS = {
  /** Selects CODE:21d8 or CODE:2462 in the external-3/CC0 path. */
  captureWorkerSelect: 0x21,
  /** Raised by the timer-1 supervisor each reload. */
  timer1Serviced: 0x2d,
  /** Staged rev-cut state, owned by CODE:27cc. */
  revCutStageActive: 0x38,
  revCutStageComplement: 0x3a,
  /** Deceleration/overrun latch, owned by CODE:3723. */
  overrunActive: 0x3b,
  /** Set when a descriptor selector returns 0xff (CODE:0413-0418). */
  calibrationMissing: 0x4b,
} as const;

/** External (paged) RAM — the spec's `EXTMEM:`/XRAM space. */
export const XRAM = {
  /** Two adaptive-correction cells, neutralised to 0x80 when disabled. */
  adaptationCellA: 0x0001,
  adaptationCellB: 0x0007,

  adaptationWorking: 0x002c,
  adaptationEdge: 0x002d,
  adaptationRegion: 0x002e,
  /** Adaptation status nibbles; cleared by CODE:89c4. */
  adaptationStatus: 0x002f,

  /** Restored to neutral 0x80 by CODE:6de3. */
  fallbackCellA: 0x0046,
  fallbackCellB: 0x0049,

  /** WOT variant result written by CODE:3a83. */
  wotVariantHigh: 0x0069,
  wotVariantLow: 0x006a,

  /** Transient enrichment, CODE:3585. */
  transientEnrichment: 0x006e,

  /** Mode-field selector; bits 3-5 choose a record field in CODE:3610. */
  modeField: 0x007a,

  /** Outgoing KW71 frame. */
  diagFrameLength: 0x00b1,
  diagFrameSequence: 0x00b2,
  diagFrameService: 0x00b3,
  diagFramePayload: 0x00b4,

  /** Fault memory bookkeeping. */
  faultCount: 0x00ec,
  faultCacheBase: 0x00ed,
  faultCursorHigh: 0x00f2,
  faultCursorLow: 0x00f3,

  /** CODE:3530 copies rev-limit record bytes 42d0-42d2 here. */
  revLimitCopyBase: 0x0207,

  /** Fault record storage: at most 51 records of 5 bytes. */
  faultRecordBase: 0x0300,
  faultRecordEnd: 0x03fe,

  /** Startup markers proving warm/cold retained state (CODE:5c00). */
  startupMarkerA: 0x00f8,
  startupMarkerB: 0x00f9,
  retainedCounter: 0x00fa,
} as const;

/** Special function registers used by the firmware. */
export const SFR = {
  P1: 0x90,
  SCON: 0x98,
  SBUF: 0x99,
  IEN0: 0xa8,
  /** Startup reads interrupt-priority state here; IP0.6 is WDTS. */
  IP0: 0xa9,
  IEN1: 0xb8,
  IRCON: 0xc0,
  CCEN: 0xc1,
  CCL1: 0xc2,
  CCH1: 0xc3,
  CCL2: 0xc4,
  CCH2: 0xc5,
  CCL3: 0xc6,
  CCH3: 0xc7,
  T2CON: 0xc8,
  CRCL: 0xca,
  CRCH: 0xcb,
  TL2: 0xcc,
  TH2: 0xcd,
  TL1: 0x8b,
  TH1: 0x8d,
  ADCON0: 0xd8,
  ADDAT: 0xd9,
  DAPR: 0xda,
  PSW: 0xd0,
} as const;

/** Bit positions the spec names explicitly. */
export const SFR_BITS = {
  /** IP0.6 — watchdog reset status, copied to PSW.F0 at reset. */
  IP0_WDTS: 6,
  /** PSW.F0 — user flag holding the preserved WDTS bit. */
  PSW_F0: 5,
  /** IEN1.SWDT — watchdog start/refresh. */
  IEN1_SWDT: 6,
  /** IEN0.EX0 — cleared by the deferred INT0 worker when it completes. */
  IEN0_EX0: 0,
  /** IEN0.EA — global interrupt enable, cleared by the recovery path. */
  IEN0_EA: 7,
  /** IRCON.TF2 — cleared by the timer-2 wrapper. */
  IRCON_TF2: 6,
} as const;

/** Code-space landmarks. Used for provenance annotations and for the ROM
 *  checksum, whose coverage boundary is an address, not a routine. */
export const CODE = {
  reset: 0x0000,
  resetWrapper: 0x0073,
  initTrampoline: 0x20e0,
  initialize: 0x5c00,
  recovery: 0x2564,
  foregroundCycle: 0x601a,
  housekeeping: 0x6096,
  lookupEntry: 0x0400,
  lookupIncrement: 0x040f,
  lookupMissing: 0x0413,
  descriptorAxisLoad: 0x046a,
  interpolateAxis1: 0x0493,
  interpolateAxis2: 0x04a2,
  faultTableIdentifier: 0x4532,
  checksumRoutine: 0x9016,
  ramTestRoutine: 0x90f5,
  /** Big-endian stored checksum word; also the coverage limit. */
  checksumWord: 0x9f00,
  checksumCoverageEnd: 0x9f00,
  identityBlockA: 0x9f02,
  identityBlockB: 0x9f0c,
  imageEnd: 0xa000,
} as const;

/** The stored ROM checksum: `sum(CODE:0000..9eff) mod 65536 = 0x7f2f`. */
export const ROM_CHECKSUM = 0x7f2f;

/** Identity strings decoded from the primary identity blocks. */
export const IDENTITY = {
  boschNumber: '0261200175',
  softwareNumber: '1267356378',
} as const;
