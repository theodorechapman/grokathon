/**
 * Everything the specification marks Unknown, in one place.
 *
 * SPECS.md refuses to emit engineering units it cannot prove from the binary:
 * oscillator frequency, RPM scaling, angle units, pulse-width units, cylinder
 * and channel mapping. This model has to run, so it supplies defaults — but
 * every one of them is flagged `assumed` and lives only here. No other module
 * hard-codes a physical constant.
 *
 * Override any field through `createEcu({ assumptions })`. The `assumed` map
 * below is what a report should disclose; `SPEC_PROVEN` values are quoted from
 * the specification and are not assumptions.
 */

export interface Assumptions {
  /** Crystal frequency. SPECS: "Unknown: oscillator frequency". */
  oscillatorHz: number;
  /** Machine cycles per oscillator period on this core. */
  cyclesPerOscillator: number;
  /** Crank capture events per crankshaft revolution. SPECS: "Unknown: exact
   *  tooth model"; a 60-2 trigger wheel is the common Motronic arrangement. */
  crankEventsPerRevolution: number;
  /** Engine revolutions per full firing cycle (four-stroke). */
  revolutionsPerCycle: number;
  /** Cylinder count implied by "four independent coil trigger pins". */
  cylinders: number;
  /** `encodedEngineSpeed` (INTMEM:003b) byte per RPM. */
  rpmPerSpeedCount: number;
  /** Rev-limit byte conversion quoted by the XDF: `912500 / byte = RPM`. */
  revLimitNumerator: number;
  /** Rev-limit buffer conversion quoted by the XDF: `count * 40 = RPM`. */
  rpmPerBufferCount: number;
  /** Idle target byte to RPM. SPECS: "Unknown: target scaling". */
  rpmPerIdleTargetCount: number;
  /** Ignition byte to degrees BTDC: `deg = raw * scale + offset`. */
  ignitionDegreesPerCount: number;
  ignitionDegreeOffset: number;
  /** Dwell byte to milliseconds. */
  dwellMsPerCount: number;
  /** Injector pulse width per fuel count, and dead time per lag count. */
  injectorMsPerFuelCount: number;
  injectorLagMsPerCount: number;
  /** AFR view applied by the XDF to fuel bytes: `1881.6 / raw`. */
  afrNumerator: number;
  /** ADC full scale in volts, and the supply divider ratio behind channel 0036. */
  adcReferenceVolts: number;
  supplyDividerRatio: number;
  /** Linear sensor conversions for the two temperature channels. */
  coolantDegCPerCount: number;
  coolantDegCOffset: number;
  intakeAirDegCPerCount: number;
  intakeAirDegCOffset: number;
  /** KW71 line rate. SPECS: "Unknown: baud rate". */
  kw71BaudRate: number;
  /** Watchdog timeout. SPECS: "No direct WDTREL reference was recovered". */
  watchdogTimeoutMs: number;
  /** Foreground cycle period used to pace the cooperative executive. */
  foregroundCycleMs: number;
  /** Timer-1 reload period; supervises the heartbeat at INTMEM:0068. */
  timer1PeriodMs: number;
  /** Heartbeat reload; expiry reaches restart. */
  heartbeatReload: number;
}

export const DEFAULT_ASSUMPTIONS: Assumptions = {
  oscillatorHz: 12_000_000,
  cyclesPerOscillator: 12,
  crankEventsPerRevolution: 60,
  revolutionsPerCycle: 2,
  cylinders: 4,
  rpmPerSpeedCount: 32,
  revLimitNumerator: 912_500,
  rpmPerBufferCount: 40,
  rpmPerIdleTargetCount: 10,
  ignitionDegreesPerCount: 0.25,
  ignitionDegreeOffset: -12,
  dwellMsPerCount: 0.05,
  injectorMsPerFuelCount: 0.0625,
  injectorLagMsPerCount: 0.02,
  afrNumerator: 1881.6,
  adcReferenceVolts: 5.0,
  supplyDividerRatio: 4.0,
  coolantDegCPerCount: -0.75,
  coolantDegCOffset: 160,
  intakeAirDegCPerCount: -0.7,
  intakeAirDegCOffset: 140,
  kw71BaudRate: 4800,
  watchdogTimeoutMs: 30,
  foregroundCycleMs: 10,
  timer1PeriodMs: 5,
  heartbeatReload: 20,
};

/** Timer-2 input clock in Hz, derived from the assumed oscillator. */
export const timerClockHz = (a: Assumptions): number =>
  a.oscillatorHz / a.cyclesPerOscillator;

export const msToTicks = (a: Assumptions, ms: number): number =>
  Math.round((timerClockHz(a) * ms) / 1000);

export const ticksToMs = (a: Assumptions, ticks: number): number =>
  (ticks * 1000) / timerClockHz(a);

/**
 * Which fields are guesses, and what the specification actually said. Surfaced
 * by `ecu.disclosure()` so a consumer of a number knows what it rests on.
 */
export const ASSUMPTION_BASIS: Record<keyof Assumptions, string> = {
  oscillatorHz: 'assumed — SPECS: oscillator frequency unknown',
  cyclesPerOscillator: 'assumed — standard 8051 divide-by-12',
  crankEventsPerRevolution: 'assumed — SPECS: tooth model unknown',
  revolutionsPerCycle: 'assumed — four-stroke',
  cylinders: 'inferred — SPECS: BMW wiring identifies four coil trigger pins',
  rpmPerSpeedCount: 'assumed — SPECS: 003b is encoded engine speed, scale unproven',
  revLimitNumerator: 'XDF claim quoted by SPECS: 912500 / 0x90 = 6336.8 RPM',
  rpmPerBufferCount: 'XDF claim quoted by SPECS: 3 * 40 = 120 RPM',
  rpmPerIdleTargetCount: 'assumed — SPECS: idle target scaling unknown',
  ignitionDegreesPerCount: 'assumed — SPECS: signed angle representation unproven',
  ignitionDegreeOffset: 'assumed — SPECS: signed angle representation unproven',
  dwellMsPerCount: 'assumed — SPECS: dwell limits and driver timing unknown',
  injectorMsPerFuelCount: 'assumed — SPECS: pulse-width units unresolved',
  injectorLagMsPerCount: 'assumed — SPECS: slot 8 is injector lag vs supply state',
  afrNumerator: 'XDF view quoted by SPECS, not an independent firmware equation',
  adcReferenceVolts: 'assumed — SPECS: physical transfer equations unknown',
  supplyDividerRatio: 'assumed — SPECS: physical transfer equations unknown',
  coolantDegCPerCount: 'assumed — SPECS: physical transfer equations unknown',
  coolantDegCOffset: 'assumed — SPECS: physical transfer equations unknown',
  intakeAirDegCPerCount: 'assumed — SPECS: physical transfer equations unknown',
  intakeAirDegCOffset: 'assumed — SPECS: physical transfer equations unknown',
  kw71BaudRate: 'assumed — SPECS: baud rate unknown',
  watchdogTimeoutMs: 'assumed — SPECS: no WDTREL reference recovered',
  foregroundCycleMs: 'assumed — SPECS: absolute tick periods unknown',
  timer1PeriodMs: 'assumed — SPECS: absolute tick periods unknown',
  heartbeatReload: 'assumed — SPECS: heartbeat units unknown',
};

/** Facts the specification proves outright. These are not tunable. */
export const SPEC_PROVEN = {
  romChecksum: 0x7f2f,
  checksumCoverageEnd: 0x9f00,
  revLimitByte: 0x90,
  revLimitBuffer: 0x03,
  maxFaultRecords: 51,
  faultRecordBytes: 5,
  maxDiagPayload: 0x10,
  syncByte: 0x55,
  handshakeByte: 0x06,
  frameTerminator: 0x03,
} as const;
