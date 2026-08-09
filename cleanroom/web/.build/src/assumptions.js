"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SPEC_PROVEN = exports.ASSUMPTION_BASIS = exports.ticksToMs = exports.msToTicks = exports.timerClockHz = exports.DEFAULT_ASSUMPTIONS = void 0;
exports.DEFAULT_ASSUMPTIONS = {
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
const timerClockHz = (a) => a.oscillatorHz / a.cyclesPerOscillator;
exports.timerClockHz = timerClockHz;
const msToTicks = (a, ms) => Math.round(((0, exports.timerClockHz)(a) * ms) / 1000);
exports.msToTicks = msToTicks;
const ticksToMs = (a, ticks) => (ticks * 1000) / (0, exports.timerClockHz)(a);
exports.ticksToMs = ticksToMs;
/**
 * Which fields are guesses, and what the specification actually said. Surfaced
 * by `ecu.disclosure()` so a consumer of a number knows what it rests on.
 */
exports.ASSUMPTION_BASIS = {
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
exports.SPEC_PROVEN = {
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
};
