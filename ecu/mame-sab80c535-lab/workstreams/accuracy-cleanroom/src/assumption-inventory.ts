import type { ProvenanceItem } from './audit-types.ts';

const file = 'cleanroom/src/assumptions.ts';
const item = (
  name: string,
  value: number,
  line: number,
  provenance: ProvenanceItem['provenance'],
  impact: ProvenanceItem['impact'],
  subsystem: string,
): ProvenanceItem => ({
  id: `assumption.${name}`,
  name,
  value,
  provenance,
  impact,
  subsystem,
  source: { file, line, needle: `${name}:` },
  sensitivity: 'unmeasured',
});

export const ASSUMPTION_INVENTORY: readonly ProvenanceItem[] = [
  item('oscillatorHz', 12_000_000, 66, 'arbitrary-model', 'timebase', 'hardware'),
  item('cyclesPerOscillator', 12, 67, 'datasheet-derived', 'timebase', 'hardware'),
  item('crankEventsPerRevolution', 60, 68, 'arbitrary-model', 'control-equation', 'crank-sync'),
  item('revolutionsPerCycle', 2, 69, 'inferred', 'control-equation', 'engine-control'),
  item('cylinders', 4, 70, 'inferred', 'actuator-wiring', 'ignition'),
  item('rpmPerSpeedCount', 32, 71, 'arbitrary-model', 'control-equation', 'speed'),
  item('revLimitNumerator', 912_500, 72, 'xdf-community', 'control-equation', 'rev-limiter'),
  item('rpmPerBufferCount', 40, 73, 'xdf-community', 'control-equation', 'rev-limiter'),
  item('rpmPerIdleTargetCount', 10, 74, 'arbitrary-model', 'control-equation', 'idle'),
  item('ignitionDegreesPerCount', 0.25, 75, 'arbitrary-model', 'control-equation', 'ignition'),
  item('ignitionDegreeOffset', -12, 76, 'arbitrary-model', 'control-equation', 'ignition'),
  item('dwellMsPerCount', 0.05, 77, 'arbitrary-model', 'control-equation', 'ignition'),
  item('injectorMsPerFuelCount', 0.0625, 78, 'arbitrary-model', 'control-equation', 'fuel'),
  item('injectorLagMsPerCount', 0.02, 79, 'arbitrary-model', 'control-equation', 'fuel'),
  item('afrNumerator', 1881.6, 80, 'xdf-community', 'control-equation', 'fuel'),
  item('adcReferenceVolts', 5, 81, 'arbitrary-model', 'control-equation', 'sensors'),
  item('supplyDividerRatio', 4, 82, 'arbitrary-model', 'control-equation', 'sensors'),
  item('coolantDegCPerCount', -0.75, 83, 'arbitrary-model', 'control-equation', 'sensors'),
  item('coolantDegCOffset', 160, 84, 'arbitrary-model', 'control-equation', 'sensors'),
  item('intakeAirDegCPerCount', -0.7, 85, 'arbitrary-model', 'control-equation', 'sensors'),
  item('intakeAirDegCOffset', 140, 86, 'arbitrary-model', 'control-equation', 'sensors'),
  item('kw71BaudRate', 4800, 87, 'arbitrary-model', 'diagnostics', 'diagnostics'),
  item('watchdogTimeoutMs', 30, 88, 'arbitrary-model', 'threshold', 'watchdog'),
  item('foregroundCycleMs', 10, 89, 'arbitrary-model', 'scheduler', 'kernel'),
  item('timer1PeriodMs', 5, 90, 'arbitrary-model', 'scheduler', 'kernel'),
  item('heartbeatReload', 20, 91, 'arbitrary-model', 'threshold', 'kernel'),
];
