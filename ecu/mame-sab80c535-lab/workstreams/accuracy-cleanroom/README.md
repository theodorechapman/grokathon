# Clean-room accuracy workstream

This workstream audits the runnable TypeScript Motronic model against independent
binary-analysis and MAME evidence. It does not treat clean-room output as its own
oracle, and it never upgrades unsupported behavior to a pass.

The source inputs are read-only:

- `cleanroom`
- `ecu/e2e-analysis`
- `ecu/mame-sab80c535-lab`

All generated and maintained output stays in this directory. There are no
runtime package dependencies.

## Run

From this directory:

```sh
npm test
npm run typecheck
npm run report
```

The harness requires Node.js with TypeScript type stripping and the repository's
TypeScript compiler. Missing, malformed, or source-drifted evidence throws an
error; it is not converted to `unknown`. `unknown` is reserved for an available
evidence set that does not support the comparison.

Read-only regression checks for the model itself:

```sh
cd ../../../../../cleanroom
npm test
npm run typecheck
```

## Outputs

- `reports/provenance.json`: every explicit assumption, additional model-local
  behavior, source line, provenance category, impact, sensitivity, external
  evidence claim, and confidence defect.
- `reports/comparisons.json`: evidence-gated pass/fail/unknown invariants.
- `reports/scenario-traces.json`: all normalized access/input/state events plus
  exact counts and first/last samples for high-frequency interrupts, services,
  and output edges.
- `reports/scenario-summary.json`: compact deterministic scenario outcomes.
- `reports/assumption-sensitivity.json`: one-at-a-time assumption perturbations.
- `reports/accuracy-matrix.json`: subsystem evidence coverage and next experiment.
- `reports/accuracy-report.md`: human-readable audit.
- `reports/cleanroom-provenance.patch`: historical patch that resolved the defects
  marked `resolved` in current reports. It has already been applied to the audited
  clean-room tree and must not be applied a second time.

## Evidence boundary

Provenance is kept as one of `binary-proven`, `runtime-proven`,
`datasheet-derived`, `xdf-community`, `inferred`, or `arbitrary-model`.
Community/XDF labels are not binary facts. MAME smoke tests are runtime facts
only for the peripherals and time window they actually exercise. Clean-room
scenario traces are model observations, not production-ROM validation.

The deterministic profiles cover cold and warm boot, stopped, cranking, sync,
idle, part-load, WOT, overrun, rev limit, timer rollover, ADC rails, watchdog
expiry, malformed diagnostics, and missing-tooth fault behavior.

The assumption sweep uses a fixed multi-mode probe. A stable result means only
that the probe did not expose an effect; it does not validate the assumption.
