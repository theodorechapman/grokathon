import type { AssumptionProvenance } from './signal-contract.ts';

const fixtureSource =
  'ecu/mame-sab80c535-lab/workstreams/signals-crank/fixtures/scenarios.json:1-10';
const boundarySource = 'ecu/mame-sab80c535-lab/HANDOFF.md:154-160';

const provenance = (
  id: string,
  claim: string,
  excludes: string[],
): AssumptionProvenance => ({
  id,
  claim,
  confidence: 'assumed',
  sources: [fixtureSource, boundarySource],
  excludes,
});

export const syntheticCrankGeometry = {
  geometry: {
    machineCyclesPerSecond: 1_000_000,
    positionsPerRevolution: 12,
    missingPositions: [11],
    captureEdge: 'falling',
    pulseWidthCycles: 2,
    initialSettleCycles: 8,
  },
  provenance: {
    machineCyclesPerSecond: provenance(
      'demo-crank-machine-cycle-rate',
      '1,000,000 machine cycles per second is the configured harness rate.',
      ['recovered ECU oscillator', 'timer prescaler evidence'],
    ),
    positionsPerRevolution: provenance(
      'demo-crank-position-count',
      'Twelve equally spaced positions per revolution are synthetic geometry.',
      ['production tooth count', 'production trigger geometry'],
    ),
    missingPositions: provenance(
      'demo-crank-missing-position',
      'Synthetic position 11 is omitted to create one configurable gap.',
      ['production missing-tooth location', 'cam phase'],
    ),
    captureEdge: provenance(
      'demo-crank-capture-edge',
      'Each present position produces a falling capture edge.',
      ['sensor electrical polarity', 'connector conditioning'],
    ),
    pulseWidthCycles: provenance(
      'demo-crank-pulse-width',
      'The low capture pulse lasts exactly two configured machine cycles.',
      ['sensor pulse width', 'sub-cycle sampling phase'],
    ),
    initialSettleCycles: provenance(
      'demo-crank-initial-settle',
      'The idle-high line settles for eight cycles before the first position.',
      ['power-on sensor behavior', 'minimum hardware settle time'],
    ),
  },
} as const;
