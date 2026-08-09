/**
 * What this model rests on.
 *
 * The specification grades every claim it makes; a model built from it should
 * be able to say the same thing about every number it emits. `disclosure()`
 * returns the full list: the facts reproduced from the binary, and the
 * assumptions filled in where the binary was silent.
 */

import { ASSUMPTION_BASIS, DEFAULT_ASSUMPTIONS, SPEC_PROVEN, type Assumptions } from './assumptions.ts';

export interface DisclosureEntry {
  field: string;
  value: number | string;
  basis: string;
  kind: 'proven' | 'assumed';
}

/** Things SPECS establishes from the binary and this model reproduces exactly. */
const PROVEN: ReadonlyArray<{ field: string; value: number | string; basis: string }> = [
  {
    field: 'resetTrace',
    value: '0000 -> 0073 -> 0075 -> 0077 -> 0079 -> 007b -> 20e0 -> 5c00',
    basis: 'deterministic emulator trace',
  },
  { field: 'romChecksum', value: SPEC_PROVEN.romChecksum, basis: 'sum(0000..9eff) mod 65536, stored big-endian at 9f00' },
  { field: 'checksumCoverageEnd', value: SPEC_PROVEN.checksumCoverageEnd, basis: 'CODE:9016 loops until DPTR=9f00' },
  { field: 'revLimitByte', value: SPEC_PROVEN.revLimitByte, basis: 'records at 42d5 and 4313' },
  { field: 'revLimitBuffer', value: SPEC_PROVEN.revLimitBuffer, basis: 'records at 42d6 and 4314' },
  { field: 'maxFaultRecords', value: SPEC_PROVEN.maxFaultRecords, basis: 'XRAM 0300-03fe, five bytes per record' },
  { field: 'maxDiagPayload', value: SPEC_PROVEN.maxDiagPayload, basis: 'CODE:8afd length bound' },
  { field: 'syncByte', value: SPEC_PROVEN.syncByte, basis: 'KW71 state 0 transmits 0x55' },
  { field: 'handshakeByte', value: SPEC_PROVEN.handshakeByte, basis: 'CODE:774f recognises 0x06' },
  { field: 'boschNumber', value: '0261200175', basis: 'identity block at 9f02' },
  { field: 'softwareNumber', value: '1267356378', basis: 'identity block at 9f0c' },
];

/** Questions SPECS leaves open that no assumption can close. */
export const OPEN_QUESTIONS: readonly string[] = [
  'Which ADC channel carries which connector signal (channels 4 and 5 unidentified).',
  'Which compare channel or port bit reaches which injector bank, coil, or DME pin 29.',
  'How four coil outputs are driven from two observed compare channels. SPECS reports ' +
    'four independent coil trigger pins in the wiring but only channels 2 and 3 in use, ' +
    'and does not recover what bridges the two.',
  'The crank tooth model, missing-tooth pattern, and cylinder phase names.',
  'The base pulse-width equation and where the final pulse width is stored.',
  'The signed angle representation for ignition advance.',
  'Which adaptation cell is additive/idle and which is multiplicative/part-load.',
  'The fault condition that triggers the 2564 recovery path.',
  'Whether an external watchdog also resets the processor.',
  'The complete KW71 command dictionary and block field layout.',
  'BMW fault-code names for the stored identifiers.',
];

export const disclosure = (assumptions: Assumptions = DEFAULT_ASSUMPTIONS): DisclosureEntry[] => [
  ...PROVEN.map((entry) => ({ ...entry, kind: 'proven' as const })),
  ...(Object.keys(assumptions) as Array<keyof Assumptions>).map((field) => ({
    field,
    value: assumptions[field],
    basis: ASSUMPTION_BASIS[field],
    kind: 'assumed' as const,
  })),
];
