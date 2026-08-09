/**
 * Interrupt vector table and the wrapper each vector jumps through.
 *
 * The specification states these pairs outright:
 *   external 0     0003 -> 2000 -> 2606
 *   timer 1        001b -> 2050 -> 257d
 *   serial         0023 -> 2060 -> 8960
 *   external 3/CC0 0053 -> 20a0 -> {21d8, 2462}
 * and locates three small workers by wrapper address only: timer 0 at
 * 2010-2014, external 1 at 2030-203d, timer 2 at 2070-2074. The ADC wrapper at
 * 2080 is a direct RETI; external 2 and external 4-6 also return immediately.
 *
 * Vectors not named by the specification are marked `assumed` and follow the
 * 8-byte vector spacing of the part. Nothing downstream depends on their exact
 * addresses — only on the source identity.
 */

import type { InterruptSource } from '../types.ts';

export interface VectorEntry {
  source: InterruptSource;
  vector: number;
  wrapper: number;
  /** Where the wrapper goes, when the specification proves a target. */
  worker: number | null;
  /** True when the wrapper is a direct RETI. */
  stub: boolean;
  provenance: 'spec' | 'assumed';
}

/** Service order. On an 8051 with equal priority the lower vector wins; this
 *  list is that order, and the controller walks it. */
export const VECTOR_TABLE: readonly VectorEntry[] = [
  { source: 'ext0', vector: 0x0003, wrapper: 0x2000, worker: 0x2606, stub: false, provenance: 'spec' },
  { source: 'timer0', vector: 0x000b, wrapper: 0x2010, worker: null, stub: false, provenance: 'spec' },
  { source: 'ext1', vector: 0x0013, wrapper: 0x2030, worker: null, stub: false, provenance: 'spec' },
  { source: 'timer1', vector: 0x001b, wrapper: 0x2050, worker: 0x257d, stub: false, provenance: 'spec' },
  { source: 'serial', vector: 0x0023, wrapper: 0x2060, worker: 0x8960, stub: false, provenance: 'spec' },
  { source: 'timer2', vector: 0x002b, wrapper: 0x2070, worker: null, stub: false, provenance: 'spec' },
  { source: 'adc', vector: 0x0043, wrapper: 0x2080, worker: null, stub: true, provenance: 'spec' },
  { source: 'ext2', vector: 0x004b, wrapper: 0x2090, worker: null, stub: true, provenance: 'spec' },
  { source: 'ext3cc0', vector: 0x0053, wrapper: 0x20a0, worker: null, stub: false, provenance: 'spec' },
  { source: 'ext4', vector: 0x005b, wrapper: 0x20b0, worker: null, stub: true, provenance: 'assumed' },
  { source: 'ext5', vector: 0x0063, wrapper: 0x20c0, worker: null, stub: true, provenance: 'assumed' },
  { source: 'ext6', vector: 0x006b, wrapper: 0x20d0, worker: null, stub: true, provenance: 'assumed' },
];

export const vectorFor = (source: InterruptSource): VectorEntry => {
  const entry = VECTOR_TABLE.find((v) => v.source === source);
  if (!entry) throw new Error(`no vector defined for interrupt source ${source}`);
  return entry;
};

/** Sources whose wrapper returns immediately (SPECS: "ADC, external 2, and
 *  external 4-6 immediately return"). */
export const STUB_SOURCES: readonly InterruptSource[] = VECTOR_TABLE.filter((v) => v.stub).map(
  (v) => v.source,
);
