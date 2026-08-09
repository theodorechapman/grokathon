/**
 * Load calculation and operating-mode selection.
 *
 * Proven: "CODE:6099 derives normalized load 0040 and encoded speed 003b", and
 * "CODE:3610 compares descriptor-backed state at INTMEM:003b and 0040, and uses
 * bits 3-5 of page-relative EXTMEM:007a to select one of several record
 * fields", probing "logical descriptors until the lookup service reports a 0xff
 * selector".
 *
 * The load *equation* is not proven, and SPECS explicitly declines to import
 * `load = air_mass / engine_speed` from Motronic literature. This model uses
 * that form anyway because it has to produce a number — it is an assumption,
 * flagged here and nowhere else. The addresses, the comparison inputs, the mode
 * field and the probe-until-0xff walk are the specification's.
 */

import { sat8 } from '../byte-math.ts';
import { IDATA, XRAM } from '../memory-map.ts';
import type { EcuContext } from '../context.ts';
import type { AirMassFilter } from './air-mass.ts';
import type { CrankSync } from './crank-sync.ts';
import type { LookupResult } from '../calibration/lookup-service.ts';

export type OperatingMode = 'stopped' | 'cranking' | 'idle' | 'part-load' | 'wide-open-throttle';

/** Mode field occupies bits 3-5 of the page-relative byte at EXTMEM:007a. */
const MODE_SHIFT = 3;
const MODE_MASK = 0x07;

/** Thresholds in the normalized byte domain. SPECS: "exact TPS/load thresholds
 *  are not named" — these are model values. */
const THRESHOLDS = {
  crankingRpm: 400,
  idleUpperRpm: 1100,
  idleUpperLoad: 0x50,
  wotLoad: 0xc0,
} as const;

/** Scale relating filtered air mass and speed to the normalized load byte.
 *  Chosen so that air flow rising in proportion with speed — which is what an
 *  open throttle does — saturates the byte, and a closed throttle sits near
 *  zero at any speed. Assumed. */
const LOAD_GAIN = 176;

export class EngineLoad {
  private mode: OperatingMode = 'stopped';

  private readonly context: EcuContext;
  private readonly airMass: AirMassFilter;
  private readonly sync: CrankSync;

  constructor(context: EcuContext, airMass: AirMassFilter, sync: CrankSync) {
    this.context = context;
    this.airMass = airMass;
    this.sync = sync;
  }

  /** CODE:6099. */
  update(): void {
    const { idata, assumptions } = this.context.machine;

    const speed = this.sync.speed();
    const rpm = speed?.rpm ?? 0;
    idata.write(
      IDATA.encodedEngineSpeed,
      sat8(Math.round(rpm / assumptions.rpmPerSpeedCount)),
    );

    const speedCounts = Math.max(1, idata.read(IDATA.encodedEngineSpeed));
    const load = sat8(Math.round((this.airMass.filteredByte() * LOAD_GAIN) / speedCounts));
    idata.write(IDATA.normalizedLoad, load);

    this.mode = this.classify(rpm, load);
    this.writeModeField(this.mode);
  }

  private classify(rpm: number, load: number): OperatingMode {
    if (rpm <= 0) return 'stopped';
    if (rpm < THRESHOLDS.crankingRpm) return 'cranking';
    if (load >= THRESHOLDS.wotLoad) return 'wide-open-throttle';
    if (rpm <= THRESHOLDS.idleUpperRpm && load <= THRESHOLDS.idleUpperLoad) return 'idle';
    return 'part-load';
  }

  private writeModeField(mode: OperatingMode): void {
    const index: Record<OperatingMode, number> = {
      stopped: 0,
      cranking: 1,
      idle: 2,
      'part-load': 3,
      'wide-open-throttle': 4,
    };
    const { xram } = this.context.machine;
    const current = xram.read(XRAM.modeField);
    const cleared = current & ~(MODE_MASK << MODE_SHIFT);
    xram.write(XRAM.modeField, cleared | ((index[mode] & MODE_MASK) << MODE_SHIFT));
  }

  /** Bits 3-5 of EXTMEM:007a, the field CODE:3610 selects on. */
  modeBits(): number {
    return (this.context.machine.xram.read(XRAM.modeField) >> MODE_SHIFT) & MODE_MASK;
  }

  operatingMode(): OperatingMode {
    return this.mode;
  }

  /** CODE:3610 — probe logical descriptors until the service reports 0xff,
   *  then compare live state. Returns everything the probe found. */
  probe(): LookupResult[] {
    return this.context.lookup.walk(0);
  }

  /** The two comparison inputs CODE:3610 reads. */
  comparisonInputs(): { encodedSpeed: number; normalizedLoad: number } {
    const { idata } = this.context.machine;
    return {
      encodedSpeed: idata.read(IDATA.encodedEngineSpeed),
      normalizedLoad: idata.read(IDATA.normalizedLoad),
    };
  }
}
