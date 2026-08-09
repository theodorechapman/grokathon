# Clean-room fidelity audit

This is a cross-validation report, not a self-consistency score. Unsupported comparisons remain `unknown`.

## Inventory

- Total inventoried inputs and choices: 160.
- Explicit Assumptions fields: 26.
- Additional model-local choices: 134.
- Historical inventory defect notes: 16 (12 resolved, 4 open).
- Provenance categories: {"arbitrary-model":154,"datasheet-derived":1,"inferred":2,"xdf-community":3}.
- Impact categories: {"actuator-wiring":13,"address":11,"api-confidence":5,"calibration":38,"control-equation":32,"diagnostics":19,"fault-behavior":3,"scheduler":14,"state-layout":11,"threshold":12,"timebase":2}.

## Evidence taxonomy

External evidence claims inventoried: 22; categories: {"binary-proven":10,"datasheet-derived":1,"inferred":3,"runtime-proven":5,"xdf-community":3}.
Binary proof, runtime proof, datasheet roles, community/XDF claims, inference, and arbitrary model choices remain distinct.

## Cross-validation outcome

- Pass: 34.
- Fail: 3.
- Unknown: 5.

- **FAIL output.ignition:** Model differs from external evidence.
- **FAIL output.injectors:** Model differs from external evidence.
- **FAIL output.idle:** Model differs from external evidence.
- **UNKNOWN calibration.bytes:** Production bytes are intentionally absent; numeric payload comparison is unsupported.
- **UNKNOWN scheduler.order:** External artifacts prove a cooperative executive, not the cleanroom service sequence.
- **UNKNOWN diagnostics.service-codes:** The command dictionary is unresolved.
- **UNKNOWN fault.thresholds:** Exact production fault thresholds are unresolved.
- **UNKNOWN timing.engineering-units:** Oscillator and timer prescaler evidence is unavailable.

## Confidence/provenance defect history

- **OPEN · HIGH · assumptions-not-centralized:** At least the separately inventoried model choices define behavior outside Assumptions and are not overrideable or disclosed.
- **RESOLVED · HIGH · scaled-confidence-overstated:** The names may be medium confidence, but values in volts, degrees, RPM, and percent depend on unproven equations and should be unknown/assumed.
- **OPEN · HIGH · selector-provenance-overstated:** Track base provenance separately from slot-content provenance.
- **RESOLVED · HIGH · master-directory-wrong:** Binary analysis proves 150 entries at 0x45c0..0x46eb with terminator 0x46ec.
- **RESOLVED · HIGH · vectors-wrong:** SAB80C515 binary vectors are ADC=0x0043 and external-2=0x004b.
- **RESOLVED · HIGH · compare-capture-sfrs-wrong:** Use CCL2/CCH2=0xc4/0xc5, CCL3/CCH3=0xc6/0xc7, CRCL/CRCH=0xca/0xcb.
- **OPEN · HIGH · ignition-output-miswired:** Binary hardware evidence maps ignition to Timer0/P1.5 and injector banks to CC2/P1.2 and CC3/P1.3.
- **OPEN · MEDIUM · echo-check-unreachable:** No path sets awaitingEcho=true, so the check is unreachable.
- **RESOLVED · MEDIUM · sfr-multibyte-read:** The SFR branch now reads address+i; the former repeated-first-byte behavior remains recorded here.

## Deterministic scenario coverage

All 15 requested scenarios executed: cold-boot, warm-boot, stopped, cranking, sync, idle, part-load, wide-open-throttle, overrun, rev-limit, timer-rollover, adc-rails, watchdog-expiry, malformed-diagnostics, missing-tooth-fault.
Their traces are cleanroom-model executions normalized to MAME-style access/interrupt/input/port concepts; they are not canonical-ROM runtime evidence.

## Assumption sensitivity

- Externally visible output changed for 21/26: oscillatorHz, cyclesPerOscillator, crankEventsPerRevolution, rpmPerSpeedCount, revLimitNumerator, rpmPerBufferCount, rpmPerIdleTargetCount, ignitionDegreesPerCount, ignitionDegreeOffset, dwellMsPerCount, injectorMsPerFuelCount, injectorLagMsPerCount, afrNumerator, adcReferenceVolts, supplyDividerRatio, coolantDegCPerCount, coolantDegCOffset, intakeAirDegCPerCount, intakeAirDegCOffset, watchdogTimeoutMs, foregroundCycleMs.
- No observed effect in the fixed probe for 5/26: revolutionsPerCycle, cylinders, kw71BaudRate, timer1PeriodMs, heartbeatReload.
- “No observed effect” means unexercised or unused in this probe, not validated.

## Highest-priority experiments

1. **kernel** (coverage 93%): Extend canonical MAME past initialization with correct Timer-2 IRQ behavior; record the actual 601a service sequence and timer reload cadence.
2. **hardware** (coverage 100%): Implement SAB80C515 external-3, compare/capture, ADC, watchdog, and extended interrupt registers in MAME, then gate exact SFR accesses and edges.
3. **crank-speed** (coverage 0%): Measure crystal/prescaler and inject a documented crank waveform while tracing 2462/21d8, 003f:CRCH:CRCL, 003b, and loss-of-sync branches.
4. **sensors** (coverage 100%): Bench known voltages and temperatures; capture ADC channels and RAM 0036-003a to establish routing and transfer functions.
5. **calibration** (coverage 67%): Replace synthetic directory/selector claims with exact canonical bytes and replay the 100 validated CODE:0400 cases through the TypeScript decoder.
6. **load-modes** (coverage 0%): Trace CODE:6099 and 3610 with controlled speed/airflow inputs; recover the integer load equation and actual mode thresholds.
7. **fuel** (coverage 0%): Trace 3800 through 6b60/2178 to CC2/CC3 under known inputs; recover correction order, pulse storage, and cut endpoint.
8. **ignition** (coverage 0%): Trace Timer0/P1.5 from 21d8/27cc using crank stimuli; recover angle/dwell units and remove the incorrect CC2/CC3 ignition wiring.
9. **idle** (coverage 0%): Trace 6bb7/6db6 and Timer1/P1.7 with load changes; identify target scaling and controller arithmetic.
10. **limiter-overrun** (coverage 100%): Drive speed through both record thresholds in canonical execution and observe BITS:0038/003a/003b, countdown 0052, and injector/ignition endpoints.
11. **adaptation-faults** (coverage 0%): Run canonical ADC rail/missing-tooth cases and capture 9158/93ff/8e50 plus XRAM fault records and fallback substitutions.
12. **diagnostics** (coverage 0%): Capture a known-tool KW71 session and replay malformed frames to recover service bytes, echo state, timeout units, and actuator pairings.
13. **integrity** (coverage 100%): Corrupt one canonical ROM byte and one XRAM test location in instrumented execution; require the 4532 subtype 4/1 paths.

## Safety boundary

Synthetic calibration, guessed engineering units, guessed branch thresholds, and model-local actuator wiring are unsuitable for tuning or safety decisions.
