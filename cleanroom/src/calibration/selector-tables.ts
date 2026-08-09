/**
 * Selector tables and lookup configurations.
 *
 * SPECS: "Lookup setup routines at 7930-7c0c write pointer-window base to
 * INTMEM:0073-0074 and selector-table base to INTMEM:0075-0076. The windows
 * overlap the 150-entry master directory. Selector tables represent operating
 * variants, not separate physical maps. CODE:798b, for example, chooses
 * selector bases 40aa, 40ae, 40b2, or 40b6 from mode bits."
 *
 * The four 798b bases and the three pointer windows (4700 primary via 7921,
 * 4730/4750 alternates via 790d) are quoted. Table *contents* and the other
 * table bases are model-assigned: the specification proves the architecture,
 * not the entries.
 */

/** A selector table maps a logical index (the firmware's R2) to a master slot.
 *  0xff terminates the walk and sets BITS:004b. */
export interface SelectorTable {
  base: number;
  label: string;
  provenance: 'spec' | 'model';
  slots: number[];
}

export const SELECTOR_TERMINATOR = 0xff;

export const SELECTOR_TABLES: readonly SelectorTable[] = [
  { base: 0x4000, label: 'fuel, part load', provenance: 'model', slots: [8, 16, 18, 19, 20] },
  { base: 0x4020, label: 'fuel, wide open throttle', provenance: 'model', slots: [26, 32, 8, 16] },
  { base: 0x4040, label: 'ignition, main', provenance: 'model', slots: [51, 53, 54, 55, 56, 57, 58, 60, 50] },
  { base: 0x4060, label: 'ignition and fuel, idle', provenance: 'model', slots: [52, 25, 50] },
  { base: 0x4080, label: 'idle targets', provenance: 'model', slots: [70, 71, 72] },
  { base: 0x40aa, label: 'mode variant 0 (CODE:798b)', provenance: 'spec', slots: [8, 18, 19, 20] },
  { base: 0x40ae, label: 'mode variant 1 (CODE:798b)', provenance: 'spec', slots: [8, 20, 19, 16] },
  { base: 0x40b2, label: 'mode variant 2 (CODE:798b)', provenance: 'spec', slots: [16, 18, 59, 61] },
  { base: 0x40b6, label: 'mode variant 3 (CODE:798b)', provenance: 'spec', slots: [16, 20, 61, 59] },
];

/** The four bases CODE:798b chooses between, in mode-bit order. */
export const MODE_VARIANT_BASES = [0x40aa, 0x40ae, 0x40b2, 0x40b6] as const;

/** CODE:798b — pick a selector base from mode bits. Which bits, and what they
 *  mean, is unresolved; the model uses the low two bits of the mode field. */
export const selectorBaseForModeBits = (modeBits: number): number =>
  MODE_VARIANT_BASES[modeBits & 0x03];

/** Pointer windows into the master directory. */
export const POINTER_WINDOWS = {
  /** CODE:7930 — primary pointer base recovered from the binary. */
  primary: 0x45c0,
  /** CODE:790d — alternate curves. */
  alternateA: 0x4730,
  alternateB: 0x4750,
} as const;

export interface LookupConfiguration {
  /** Setup routine address, within the proven 7930-7c0c range where known. */
  setupRoutine: number;
  label: string;
  pointerWindowBase: number;
  selectorTableBase: number;
}

export const LOOKUP_CONFIGURATIONS: Record<string, LookupConfiguration> = {
  fuelPartLoad: {
    setupRoutine: 0x7930,
    label: 'fuel, part load',
    pointerWindowBase: POINTER_WINDOWS.primary,
    selectorTableBase: 0x4000,
  },
  fuelWideOpenThrottle: {
    setupRoutine: 0x7960,
    label: 'fuel, wide open throttle',
    pointerWindowBase: POINTER_WINDOWS.primary,
    selectorTableBase: 0x4020,
  },
  ignition: {
    setupRoutine: 0x7990,
    label: 'ignition, main',
    pointerWindowBase: POINTER_WINDOWS.primary,
    selectorTableBase: 0x4040,
  },
  idle: {
    setupRoutine: 0x79c0,
    label: 'idle',
    pointerWindowBase: POINTER_WINDOWS.primary,
    selectorTableBase: 0x4060,
  },
  idleTargets: {
    setupRoutine: 0x79f0,
    label: 'idle targets',
    pointerWindowBase: POINTER_WINDOWS.primary,
    selectorTableBase: 0x4080,
  },
  /** CODE:7b2f is the configuration selector the adaptation supervisor enters
   *  through (SPECS: "CODE:677c ... enters 678e through the configuration
   *  selector at 7b2f"). */
  adaptation: {
    setupRoutine: 0x7b2f,
    label: 'adaptation',
    pointerWindowBase: POINTER_WINDOWS.alternateA,
    selectorTableBase: 0x40aa,
  },
  /** CODE:790d selects the alternate curve family. */
  alternateCurves: {
    setupRoutine: 0x790d,
    label: 'alternate curves',
    pointerWindowBase: POINTER_WINDOWS.alternateB,
    selectorTableBase: 0x40b2,
  },
};
