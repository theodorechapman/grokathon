/**
 * Named runtime state, and the only place raw bytes become engineering units.
 *
 * SPECS grades these names: "Static consumers support these evidence-scored
 * names: 0036 scaled supply voltage, 0037 intake-air temperature, 0038 coolant
 * temperature, 0039 an unknown hysteretic channel (possibly lambda), and 003a
 * an unresolved channel. 003b is encoded engine speed, 0040 normalized load,
 * and 0041-0042 filtered air mass. Physical volts/degrees units remain
 * unresolved."
 *
 * Every conversion below therefore carries its confidence, and every scale
 * factor comes from `Assumptions`. A caller that only trusts proven facts reads
 * `.raw`.
 */

import type { Assumptions } from '../assumptions.ts';
import type { Confidence, Scaled } from '../types.ts';
import { IDATA } from '../memory-map.ts';
import type { InternalMemory } from '../hardware/internal-memory.ts';

export interface ChannelDescription {
  address: number;
  name: string;
  confidence: Confidence;
  note?: string;
}

export const CHANNELS: readonly ChannelDescription[] = [
  { address: IDATA.scaledSupplyVoltage, name: 'scaled supply voltage', confidence: 'medium' },
  { address: IDATA.intakeAirTemperature, name: 'intake-air temperature', confidence: 'medium' },
  { address: IDATA.coolantTemperature, name: 'coolant temperature', confidence: 'medium' },
  {
    address: IDATA.hystereticChannel,
    name: 'hysteretic channel',
    confidence: 'unknown',
    note: 'possibly lambda; identity not established',
  },
  { address: IDATA.unresolvedChannel, name: 'unresolved channel', confidence: 'unknown' },
  { address: IDATA.encodedEngineSpeed, name: 'encoded engine speed', confidence: 'medium' },
  { address: IDATA.normalizedLoad, name: 'normalized load', confidence: 'medium' },
  { address: IDATA.filteredAirMassHigh, name: 'filtered air mass, high', confidence: 'medium' },
  { address: IDATA.filteredAirMassLow, name: 'filtered air mass, low', confidence: 'medium' },
];

export class SensorState {
  private readonly idata: InternalMemory;
  private readonly assumptions: Assumptions;

  constructor(idata: InternalMemory, assumptions: Assumptions) {
    this.idata = idata;
    this.assumptions = assumptions;
  }

  raw(address: number): number {
    return this.idata.read(address);
  }

  set(address: number, value: number): void {
    this.idata.write(address, value);
  }

  supplyVolts(): Scaled {
    const raw = this.raw(IDATA.scaledSupplyVoltage);
    const { adcReferenceVolts, supplyDividerRatio } = this.assumptions;
    return {
      raw,
      value: (raw / 0xff) * adcReferenceVolts * supplyDividerRatio,
      unit: 'V',
      confidence: 'unknown',
    };
  }

  coolantDegC(): Scaled {
    const raw = this.raw(IDATA.coolantTemperature);
    return {
      raw,
      value: raw * this.assumptions.coolantDegCPerCount + this.assumptions.coolantDegCOffset,
      unit: 'degC',
      confidence: 'unknown',
    };
  }

  intakeAirDegC(): Scaled {
    const raw = this.raw(IDATA.intakeAirTemperature);
    return {
      raw,
      value: raw * this.assumptions.intakeAirDegCPerCount + this.assumptions.intakeAirDegCOffset,
      unit: 'degC',
      confidence: 'unknown',
    };
  }

  /** INTMEM:003b. SPECS proves the name, not the scale. */
  engineSpeedRpm(): Scaled {
    const raw = this.raw(IDATA.encodedEngineSpeed);
    return {
      raw,
      value: raw * this.assumptions.rpmPerSpeedCount,
      unit: 'rpm',
      confidence: 'unknown',
    };
  }

  setEngineSpeedRpm(rpm: number): void {
    const counts = Math.round(rpm / this.assumptions.rpmPerSpeedCount);
    this.set(IDATA.encodedEngineSpeed, counts > 0xff ? 0xff : counts < 0 ? 0 : counts);
  }

  /** INTMEM:0040. SPECS: "does not prove percent or RPM units". */
  normalizedLoad(): Scaled {
    const raw = this.raw(IDATA.normalizedLoad);
    return { raw, value: (raw * 100) / 0xff, unit: '% of calibrated span', confidence: 'unknown' };
  }

  /** INTMEM:0041-0042, produced by CODE:2d73. */
  filteredAirMass(): number {
    return this.idata.readWord(IDATA.filteredAirMassHigh);
  }

  setFilteredAirMass(value: number): void {
    this.idata.writeWord(IDATA.filteredAirMassHigh, value & 0xffff);
  }

  /** Everything a diagnostic block or a test wants, in one object. */
  summary(): Record<string, Scaled | number> {
    return {
      supply: this.supplyVolts(),
      coolant: this.coolantDegC(),
      intakeAir: this.intakeAirDegC(),
      engineSpeed: this.engineSpeedRpm(),
      load: this.normalizedLoad(),
      hystereticChannel: this.raw(IDATA.hystereticChannel),
      unresolvedChannel: this.raw(IDATA.unresolvedChannel),
      filteredAirMass: this.filteredAirMass(),
    };
  }
}
