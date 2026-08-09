import type { ProvenanceItem } from './audit-types.ts';

const choice = (
  id: string,
  name: string,
  value: unknown,
  file: string,
  line: number,
  needle: string,
  impact: ProvenanceItem['impact'] = 'calibration',
  defect?: string,
): ProvenanceItem => ({
  id: `choice.${id}`,
  name,
  value,
  provenance: 'arbitrary-model',
  impact,
  subsystem: 'calibration',
  source: { file: `cleanroom/src/${file}`, line, needle },
  sensitivity: 'unmeasured',
  defect,
});

const selector = (base: number, slots: number[], line: number, provenance = 'model'): ProvenanceItem =>
  choice(`selector-${base.toString(16)}`, `selector ${base.toString(16)} contents`, { base, slots, provenance }, 'calibration/selector-tables.ts', line, `base: 0x${base.toString(16)}`);

const shape = (id: string, equation: string, line: number): ProvenanceItem =>
  choice(`payload-${id}`, `synthetic ${id} bytes`, equation, 'calibration/payload-shapes.ts', line, `'${id}'`);

const resolved = (item: ProvenanceItem): ProvenanceItem => ({ ...item, defectStatus: 'resolved' });

export const CALIBRATION_CHOICES: readonly ProvenanceItem[] = [
  choice('rom-pad-range', 'synthetic ROM checksum padding range', '0x9df0..0x9eff', 'rom-image.ts', 23, 'PAD_START'),
  choice('rom-filler', 'synthetic ROM filler equation', '(address*31 + page*7 + 0x5a) & 0xff', 'rom-image.ts', 46, 'a * 31'),
  choice('calibration-region', 'synthetic calibration region bounds', '0x4000..0x5fff', 'calibration/calibration-image.ts', 21, 'CALIBRATION_BASE'),
  resolved(choice('master-directory-base', 'master directory base', 0x45c0, 'calibration/calibration-image.ts', 24, 'MASTER_DIRECTORY_BASE', 'address', 'Previously used 0x4700; binary analysis proves 0x45c0.')),
  choice('directory-axis-flag', 'directory two-axis flag encoding', 0x8000, 'calibration/calibration-image.ts', 28, 'TWO_AXIS_FLAG', 'calibration', 'Binary evidence places the dimension selector in selector bit 0, not a pointer top bit.'),
  choice('axis-span', 'all synthetic descriptor breakpoints span 0..255', 'rounded linear span', 'calibration/payload-shapes.ts', 29, 'spanAxis'),
  shape('fuel-base', '40 + 170*load - 25*speed', 42),
  shape('fuel-wot', '205 + 30*speed', 44),
  shape('fuel-idle', '150 - 45*speed', 46),
  shape('accel-enrichment', '200 - 170*axis', 48),
  shape('temperature-enrichment', '240 - 180*axis', 50),
  shape('injector-lag', '190 - 150*supply', 52),
  choice('payload-trim', 'synthetic trim bytes', '(0.5 + 0.25*(supply-0.5) - 0.15*(temp-0.5))*255', 'calibration/payload-shapes.ts', 54, 'trim:'),
  shape('ignition-advance', '60 + 150*speed - 60*load', 56),
  shape('ignition-idle', '110 - 40*speed', 57),
  choice('payload-dwell', 'synthetic dwell bytes', '200 - 120*supply + 40*speed', 'calibration/payload-shapes.ts', 59, 'dwell:'),
  shape('idle-target', '95 - 20*axis', 61),
  choice('rev-record-filler', 'non-proven rev-limit record bytes', '0x20 + offset', 'calibration/rev-limit-record.ts', 56, '0x20 + i'),
  selector(0x4000, [8, 16, 18, 19, 20], 28),
  selector(0x4020, [26, 32, 8, 16], 29),
  selector(0x4040, [51, 53, 54, 55, 56, 57, 58, 60, 50], 30),
  selector(0x4060, [52, 25, 50], 31),
  selector(0x4080, [70, 71, 72], 32),
  selector(0x40aa, [8, 18, 19, 20], 33, 'spec'),
  selector(0x40ae, [8, 20, 19, 16], 34, 'spec'),
  selector(0x40b2, [16, 18, 59, 61], 35, 'spec'),
  selector(0x40b6, [16, 20, 61, 59], 36, 'spec'),
  choice('selector-mode-bits', 'low two mode bits select 40aa/40ae/40b2/40b6', 'modeBits & 3', 'calibration/selector-tables.ts', 44, 'selectorBaseForModeBits'),
  resolved(choice('pointer-windows', 'pointer windows', { primary: 0x45c0, alternateA: 0x4730, alternateB: 0x4750 }, 'calibration/selector-tables.ts', 48, 'POINTER_WINDOWS', 'address', 'Primary pointer previously used 0x4700 instead of the proven 0x45c0.')),
  resolved(choice('lookup-config-fuel-part', 'fuel part-load lookup configuration', { setup: 0x7930, pointer: 0x45c0, selector: 0x4000 }, 'calibration/selector-tables.ts', 65, 'fuelPartLoad', 'address', 'Fuel part-load previously used pointer 0x4700 instead of 0x45c0.')),
  choice('lookup-config-wot', 'WOT lookup configuration', { setup: 0x7960, pointer: 0x45c0, selector: 0x4020 }, 'calibration/selector-tables.ts', 71, 'fuelWideOpenThrottle'),
  choice('lookup-config-ignition', 'ignition lookup configuration', { setup: 0x7990, pointer: 0x45c0, selector: 0x4040 }, 'calibration/selector-tables.ts', 77, 'ignition:'),
  choice('lookup-config-idle', 'idle lookup configuration', { setup: 0x79c0, pointer: 0x45c0, selector: 0x4060 }, 'calibration/selector-tables.ts', 83, 'idle:'),
  choice('lookup-config-targets', 'idle-target lookup configuration', { setup: 0x79f0, pointer: 0x45c0, selector: 0x4080 }, 'calibration/selector-tables.ts', 89, 'idleTargets'),
  choice('lookup-config-adaptation', 'adaptation lookup configuration', { setup: 0x7b2f, pointer: 0x4730, selector: 0x40aa }, 'calibration/selector-tables.ts', 98, 'adaptation:'),
  choice('lookup-config-alternate', 'alternate-curves lookup configuration', { setup: 0x790d, pointer: 0x4750, selector: 0x40b2 }, 'calibration/selector-tables.ts', 105, 'alternateCurves'),
  choice('model-slots-part-load', 'model-assigned part-load master slots', [40, 41, 42, 43, 44, 45], 'calibration/payload-catalog.ts', 119, '0x4b42'),
  choice('model-slots-ignition', 'model-assigned ignition master slots', [50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61], 'calibration/payload-catalog.ts', 140, 'payloadAddress: 0x50eb'),
  choice('model-slots-idle', 'model-assigned idle target master slots', [70, 71, 72], 'calibration/payload-catalog.ts', 206, 'payloadAddress: 0x57ef'),
  choice('descriptor-layout-reconstruction', 'synthetic descriptors placed backward from payload addresses', 'header immediately precedes payload', 'calibration/calibration-image.ts', 89, 'const place'),
];
