/**
 * What the bench shows, and what each number rests on.
 *
 * `grade` is the whole point of the page:
 *   proven  — SPECS establishes it from the binary; this model reproduces it.
 *   assumed — a unit conversion the specification refused to state, taken from
 *             `src/assumptions.ts`, where it is disclosed.
 *   model   — a mechanism the specification located but did not decode, filled
 *             in here so the controller can run. No claim is made about it.
 *
 * Labels are in plain language and the firmware's own name for the thing rides
 * along as a caption, so the page is readable without the write-up open. Each
 * `basis` starts with what the value means before it gets technical.
 */

import type { Snapshot } from './bench.ts';

export type Grade = 'proven' | 'assumed' | 'model';

export interface Readout {
  label: string;
  /** The firmware's name or address for the same thing. */
  caption?: string;
  group: 'primary' | 'secondary' | 'limiter';
  grade: Grade;
  basis: string;
  read(snapshot: Snapshot): string;
}

const hex = (value: number, width = 2): string => value.toString(16).padStart(width, '0');
const mameInternalUnavailable = (snapshot: Snapshot): boolean =>
  snapshot.mode.startsWith('MAME');

const SYNC_NAMES = ['no signal', 'finding the crank', 'locked on'];

export const BENCH_READOUTS: readonly Readout[] = [
  {
    label: 'engine speed',
    caption: 'from the crank sensor',
    group: 'primary',
    grade: 'assumed',
    basis:
      'How fast the engine is turning. The controller never measures rpm — it measures the time between teeth on the crank wheel. Turning that into rpm needs the crystal frequency and the number of teeth per turn, and the write-up proves neither, so both are assumed here.',
    read: (s) => `${s.rpm.toFixed(0)} rpm`,
  },
  {
    label: 'what it thinks it is doing',
    caption: 'operating mode',
    group: 'primary',
    grade: 'model',
    basis:
      'Idling, cruising, or flat out — the controller keeps a different fuel and spark map for each. That it chooses a mode from three bits in external RAM is proven (CODE:3610, bits 3-5 of EXTMEM:007a). The speed and load thresholds that pick one are not named anywhere, so they are this model\'s.',
    read: (s) => s.mode,
  },
  {
    label: 'gap between teeth',
    caption: 'timer counts',
    group: 'secondary',
    grade: 'proven',
    basis:
      'The raw measurement everything else is built on: how many timer counts passed between two teeth of the crank wheel. No conversion has been applied, which is why it is in black — this is the quantity the firmware actually holds.',
    read: (s) => (s.capturePeriodTicks === null ? '—' : `${s.capturePeriodTicks} counts`),
  },
  {
    label: 'speed byte',
    caption: 'INTMEM:003b',
    group: 'secondary',
    grade: 'assumed',
    basis:
      'The one byte of memory the controller keeps engine speed in. The address and the name "encoded engine speed" are the write-up\'s; how many rpm one count is worth is not, so this model picked a scale.',
    read: (s) => (mameInternalUnavailable(s) ? '—' : hex(s.encodedSpeed)),
  },
  {
    label: 'engine load',
    caption: 'INTMEM:0040',
    group: 'secondary',
    grade: 'model',
    basis:
      'How hard the engine is working — roughly, air per intake stroke, from 00 (closed throttle) to ff. That the value lives at this address is proven. The equation behind it is not: the write-up refused to import "air mass ÷ engine speed" from Motronic literature, and this model uses it anyway.',
    read: (s) => (mameInternalUnavailable(s) ? '—' : hex(s.normalizedLoad)),
  },
  {
    label: 'crank tracking',
    caption: 'INTMEM:0071',
    group: 'secondary',
    grade: 'model',
    basis:
      'Whether the controller has worked out where the crankshaft is. Until it has, it cannot time a spark. The memory byte and its bit are the write-up\'s; reading them as "still looking" versus "locked on", after four believable tooth gaps, is this model\'s interpretation.',
    read: (s) =>
      mameInternalUnavailable(s) ? '—' : (SYNC_NAMES[s.syncState] ?? `${s.syncState}`),
  },
  {
    label: 'fuel per squirt',
    caption: 'injector open time',
    group: 'secondary',
    grade: 'assumed',
    basis:
      'How long the injectors are held open, which is how a petrol engine meters fuel. The controller works in raw counts; milliseconds need an assumed conversion, and the write-up says the pulse-width units were never resolved.',
    read: (s) => (s.fuel === null ? '—' : `${s.fuel.pulseWidthMs.toFixed(2)} ms`),
  },
  {
    label: 'fuel, as the chip stores it',
    caption: 'raw byte',
    group: 'secondary',
    grade: 'model',
    basis:
      'The same fuel command before any conversion. Looking the value up in the calibration tables and correcting it is proven behaviour; the equation that turns it into an injector opening is not recovered.',
    read: (s) => (s.fuel === null ? '—' : hex(s.fuel.pulseCount)),
  },
  {
    label: 'air-fuel ratio',
    caption: 'tuner\'s view',
    group: 'secondary',
    grade: 'assumed',
    basis:
      'Roughly how rich the mixture is — around 14.7 is chemically ideal, lower is richer. This is 1881.6 ÷ the fuel byte, a conversion tuning software applies to these tables. The write-up quotes it but does not find it in the firmware.',
    read: (s) => (s.fuel === null || s.fuel.base === 0 ? '—' : s.fuel.afrView.toFixed(1)),
  },
  {
    label: 'spark timing',
    caption: 'before top dead centre',
    group: 'secondary',
    grade: 'assumed',
    basis:
      'How early the spark fires, in crankshaft degrees before the piston reaches the top. The controller holds it as a byte; the write-up never established how that byte encodes an angle, so the conversion here is a guess.',
    read: (s) => (s.ignition === null ? '—' : `${s.ignition.advanceDegBtdc.toFixed(1)}°`),
  },
  {
    label: 'coil charge time',
    caption: 'dwell',
    group: 'secondary',
    grade: 'assumed',
    basis:
      'How long current runs through the ignition coil before the spark. Too short and the spark is weak, too long and the coil cooks. The byte is real; the milliseconds are assumed, and even the two table axes behind it are not confidently identified.',
    read: (s) => (s.ignition === null ? '—' : `${s.ignition.dwellMs.toFixed(2)} ms`),
  },
  {
    label: 'idle it is aiming for',
    caption: 'target speed',
    group: 'secondary',
    grade: 'assumed',
    basis:
      'The speed the controller tries to hold with your foot off the pedal, read from a table indexed by coolant temperature. The table is real; the unit of its bytes is not, and its axis labels do not even match its size — four labels for six values.',
    read: (s) => (s.idle === null ? '—' : `${s.idle.targetRpm.toFixed(0)} rpm`),
  },

  {
    label: 'the byte in the ROM',
    caption: 'record 42d5',
    group: 'limiter',
    grade: 'proven',
    basis:
      'The rev limit as the chip actually stores it: one byte, 0x90, at a known address. This is the thing that is certain. Everything to its right is inference from it.',
    read: (s) => (mameInternalUnavailable(s) ? '—' : hex(s.limitByte)),
  },
  {
    label: 'cuts fuel at',
    caption: '912500 ÷ 0x90',
    group: 'limiter',
    grade: 'assumed',
    basis:
      'The famous number — 6336.8 rpm — is 912500 divided by that byte. That division comes from a tuning file, not from the firmware, and the write-up grades it low confidence. Change the 912500 in the evidence panel and watch this move while the byte does not.',
    read: (s) =>
      mameInternalUnavailable(s) ? '—' : `${s.limiter.limitRpm.toFixed(1)} rpm`,
  },
  {
    label: 'lets fuel back at',
    caption: 'limit − buffer',
    group: 'limiter',
    grade: 'assumed',
    basis:
      'Once cut, the controller waits for the engine to fall this far before injecting again — which is what makes a limiter bounce rather than simply stop. The gap comes from a second byte through another tuning-file conversion.',
    read: (s) =>
      mameInternalUnavailable(s) ? '—' : `${s.limiter.resumeRpm.toFixed(1)} rpm`,
  },
  {
    label: 'the limiter bit',
    caption: 'BITS:0038',
    group: 'limiter',
    grade: 'proven',
    basis:
      'A single bit of memory that flips when the engine is over the limit. This bit, the routine that owns it, its complement and its countdown were all recovered — it is one of the best-established things in the whole write-up.',
    read: (s) =>
      mameInternalUnavailable(s) ? '—' : s.limiter.cutStageActive ? 'latched' : 'clear',
  },
  {
    label: 'injectors',
    caption: 'what the cut does',
    group: 'limiter',
    grade: 'model',
    basis:
      'The write-up is explicit that the path from that bit to a physical injector was never uniquely proven. A running controller has to do something, so this model cuts fuel — and says so rather than pretending it found the wire.',
    read: (s) =>
      s.fuel === null ? '—' : s.fuel.cut ? `cut — ${s.fuel.cutReason ?? ''}` : 'firing',
  },
];
