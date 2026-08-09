import type { AssumptionProvenance } from './signal-contract.ts';

type AssumedConstant = Readonly<{
  value: number;
  unit: string;
  provenance: AssumptionProvenance;
}>;

const source = [
  'ecu/mame-sab80c535-lab/HANDOFF.md:178-202',
  'cleanroom/web/app/engine-plant.ts:1-12 (control-flow shape only; value newly selected)',
];

const assumed = (
  id: string,
  value: number,
  unit: string,
  purpose: string,
  excludes: string[],
): AssumedConstant => ({
  value,
  unit,
  provenance: {
    id,
    claim: `${purpose}: ${value} ${unit} is a disclosed deterministic demo selection.`,
    confidence: 'assumed',
    sources: source,
    excludes,
  },
});

export const demoPlantConstants = {
  fixedStepMilliseconds: assumed(
    'demo-plant-fixed-step',
    10,
    'milliseconds',
    'Plant integration step',
    ['ECU scheduler timing', 'physical integration accuracy'],
  ),
  throttleScale: assumed(
    'demo-plant-throttle-scale',
    1_000,
    'integer-parts',
    'Pedal and throttle fixed-point full scale',
    ['throttle angle', 'pedal voltage'],
  ),
  throttleSlewPerStep: assumed(
    'demo-plant-throttle-slew',
    40,
    'integer-parts-per-step',
    'Throttle-intent slew limit',
    ['throttle-body dynamics', 'cable compliance'],
  ),
  afmMinimumCode: assumed(
    'demo-plant-afm-minimum',
    4,
    'callback-code',
    'Zero-intent AFM callback code',
    ['AFM voltage', 'air mass', 'recovered transfer function'],
  ),
  afmMaximumCode: assumed(
    'demo-plant-afm-maximum',
    120,
    'callback-code',
    'Full-intent AFM callback code',
    ['AFM voltage', 'air mass', 'recovered transfer function'],
  ),
  starterCutoffMilliRpm: assumed(
    'demo-plant-starter-cutoff',
    450_000,
    'milli-rpm',
    'Starter drive cutoff',
    ['starter hardware behavior', 'starter free speed'],
  ),
  starterTorqueUnits: assumed(
    'demo-plant-starter-torque',
    2_400_000,
    'demo-torque-units',
    'Starter drive contribution',
    ['newton-metres', 'battery sag', 'starter current'],
  ),
  combustionIdleTorqueUnits: assumed(
    'demo-plant-combustion-idle-torque',
    450_000,
    'demo-torque-units',
    'Schedule-gated minimum combustion contribution',
    ['fuel mass', 'indicated torque', 'injector pulse width'],
  ),
  combustionGainTorqueUnits: assumed(
    'demo-plant-combustion-gain',
    12_000_000,
    'demo-torque-units',
    'AFM-dependent combustion contribution',
    ['fuel mass', 'volumetric efficiency', 'physical engine torque'],
  ),
  injectorScheduleHoldSteps: assumed(
    'demo-plant-injector-schedule-hold',
    50,
    'plant-steps',
    'Maximum interval that a CC2/CC3 schedule observation enables combustion',
    ['injector pulse width', 'physical fuel delivery', 'exact compare-pin waveform'],
  ),
  dragLinearPermille: assumed(
    'demo-plant-linear-drag',
    500,
    'permille',
    'Linear speed drag coefficient',
    ['friction measurement', 'pumping loss'],
  ),
  dragQuadraticDivisorMilliRpm: assumed(
    'demo-plant-quadratic-drag',
    6_500_000,
    'milli-rpm',
    'Quadratic speed drag divisor',
    ['aerodynamic loss', 'measured engine friction'],
  ),
  brakeTorqueUnits: assumed(
    'demo-plant-brake-load',
    10_000_000,
    'demo-torque-units',
    'Full-scale external brake contribution',
    ['dyno calibration', 'vehicle road load'],
  ),
  inertiaDivisor: assumed(
    'demo-plant-inertia',
    4,
    'integer-divisor',
    'Net demo torque to speed-acceleration divisor',
    ['rotational inertia', 'flywheel mass', 'driveline inertia'],
  ),
  stallMilliRpm: assumed(
    'demo-plant-stall-speed',
    60_000,
    'milli-rpm',
    'Non-driven speed snapped to stopped',
    ['physical stall threshold', 'cranking synchronization threshold'],
  ),
  maximumMilliRpm: assumed(
    'demo-plant-maximum-speed',
    9_000_000,
    'milli-rpm',
    'Arithmetic safety clamp',
    ['firmware limiter threshold', 'mechanical safe speed'],
  ),
} as const;
