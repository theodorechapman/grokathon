# Open questions and evidence required

## Image authenticity

- The 8 KiB internal image is a community UART dump. A factory mask-ROM dump
  or two independent physical reads are required for provenance authentication.
- Reachable code boundaries and external-call targets strongly corroborate the
  bytes, but cannot prove chain of custody.

## Program classification

- Twenty-four functions remain low confidence because of speculative high-ROM
  flow, decompiler errors, or targets beyond `CODE:9fff`.
- Many valid functions retain `unknown_<address>` semantic names. Hardware
  traces or stronger interprocedural typing are required to name them without
  importing generic Motronic assumptions.
- Indirect dispatch tables need runtime targets to prove every call edge.

## Runtime data

- `MOVX @Ri` combines `Ri` with `P2`; a page-sensitive data-flow pass or live
  trace is required to turn all low-byte XRAM offsets into unique addresses.
- Width, signedness, units, and update rates for most IDATA/XRAM state remain
  unknown.
- Lookup call `CODE:3640` has a documented `R2` live-in through
  `3585 -> 212a -> 3610`. Custom-ABI interprocedural propagation or a
  breakpoint trace is required to bound the initial set.

## Calibration semantics

- Selector tables expose conflicting one/two-axis uses for some pointer slots.
  Runtime configuration context is needed to decide which variant is active.
- Thirty-six master slots have no recovered selector dimension flag.
- Five active XDF tables do not exactly match a decoded descriptor payload.
  They may be compound/AFM formats, direct constants, or erroneous definitions.
- XDF AFR, BTDC, RPM, and descriptive labels need consumer-side equations
  before being accepted as firmware units.

## Engine-control equations

- Crank tooth model, timer prescaler, oscillator frequency, and RPM scale.
- ADC channel-to-sensor mapping and volts-to-engineering-unit transfer.
- Base fuel equation, complete correction order, pulse-width units, and
  physical CC2/CC3 injector-bank routing.
- Ignition angle representation, dwell units/custom object layout, and
  downstream distribution from the logical P1.5 coil command.
- Idle controller gain terminology, target scaling, and P1.7-to-pin routing.
- Physical cut endpoint for the recovered primary rev-limit state machine,
  secondary limit record usage, and overrun engineering thresholds.
- Engineering units and physical interpretation of the two `0x80`-centered
  adaptation cells; external retention, if any.

These require a PCB schematic/continuity map, crystal frequency, live RAM
captures, or controlled bench execution with known sensor waveforms.

## Diagnostics

- Exact on-wire command/response byte names, non-primary identifier meanings,
  physical names for six actuator-test channels, and BMW DTC names.
- Baud initialization and K-line electrical behavior.

A captured request/response session from a known diagnostic tool would resolve
most of these questions.

## Integrity and safety

- `CODE:9016` proves the checksum calculation and comparison; what remains
  unknown is the production/programming process that installs `9f00`.
- External watchdog wiring and reset cause are unknown.
- Analog tolerances, injector/coil power stages, EMI behavior, and fail-safe
  electrical states cannot be validated from binaries.

Vehicle or bench tests are required before any safety or tuning use. The
software-only traces in this directory are not calibration or operational
approval.
