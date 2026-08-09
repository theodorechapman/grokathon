"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SensorState = exports.CHANNELS = void 0;
const memory_map_ts_1 = require("../memory-map.js");
exports.CHANNELS = [
    { address: memory_map_ts_1.IDATA.scaledSupplyVoltage, name: 'scaled supply voltage', confidence: 'medium' },
    { address: memory_map_ts_1.IDATA.intakeAirTemperature, name: 'intake-air temperature', confidence: 'medium' },
    { address: memory_map_ts_1.IDATA.coolantTemperature, name: 'coolant temperature', confidence: 'medium' },
    {
        address: memory_map_ts_1.IDATA.hystereticChannel,
        name: 'hysteretic channel',
        confidence: 'unknown',
        note: 'possibly lambda; identity not established',
    },
    { address: memory_map_ts_1.IDATA.unresolvedChannel, name: 'unresolved channel', confidence: 'unknown' },
    { address: memory_map_ts_1.IDATA.encodedEngineSpeed, name: 'encoded engine speed', confidence: 'medium' },
    { address: memory_map_ts_1.IDATA.normalizedLoad, name: 'normalized load', confidence: 'medium' },
    { address: memory_map_ts_1.IDATA.filteredAirMassHigh, name: 'filtered air mass, high', confidence: 'medium' },
    { address: memory_map_ts_1.IDATA.filteredAirMassLow, name: 'filtered air mass, low', confidence: 'medium' },
];
class SensorState {
    idata;
    assumptions;
    constructor(idata, assumptions) {
        this.idata = idata;
        this.assumptions = assumptions;
    }
    raw(address) {
        return this.idata.read(address);
    }
    set(address, value) {
        this.idata.write(address, value);
    }
    supplyVolts() {
        const raw = this.raw(memory_map_ts_1.IDATA.scaledSupplyVoltage);
        const { adcReferenceVolts, supplyDividerRatio } = this.assumptions;
        return {
            raw,
            value: (raw / 0xff) * adcReferenceVolts * supplyDividerRatio,
            unit: 'V',
            confidence: 'unknown',
        };
    }
    coolantDegC() {
        const raw = this.raw(memory_map_ts_1.IDATA.coolantTemperature);
        return {
            raw,
            value: raw * this.assumptions.coolantDegCPerCount + this.assumptions.coolantDegCOffset,
            unit: 'degC',
            confidence: 'unknown',
        };
    }
    intakeAirDegC() {
        const raw = this.raw(memory_map_ts_1.IDATA.intakeAirTemperature);
        return {
            raw,
            value: raw * this.assumptions.intakeAirDegCPerCount + this.assumptions.intakeAirDegCOffset,
            unit: 'degC',
            confidence: 'unknown',
        };
    }
    /** INTMEM:003b. SPECS proves the name, not the scale. */
    engineSpeedRpm() {
        const raw = this.raw(memory_map_ts_1.IDATA.encodedEngineSpeed);
        return {
            raw,
            value: raw * this.assumptions.rpmPerSpeedCount,
            unit: 'rpm',
            confidence: 'unknown',
        };
    }
    setEngineSpeedRpm(rpm) {
        const counts = Math.round(rpm / this.assumptions.rpmPerSpeedCount);
        this.set(memory_map_ts_1.IDATA.encodedEngineSpeed, counts > 0xff ? 0xff : counts < 0 ? 0 : counts);
    }
    /** INTMEM:0040. SPECS: "does not prove percent or RPM units". */
    normalizedLoad() {
        const raw = this.raw(memory_map_ts_1.IDATA.normalizedLoad);
        return { raw, value: (raw * 100) / 0xff, unit: '% of calibrated span', confidence: 'unknown' };
    }
    /** INTMEM:0041-0042, produced by CODE:2d73. */
    filteredAirMass() {
        return this.idata.readWord(memory_map_ts_1.IDATA.filteredAirMassHigh);
    }
    setFilteredAirMass(value) {
        this.idata.writeWord(memory_map_ts_1.IDATA.filteredAirMassHigh, value & 0xffff);
    }
    /** Everything a diagnostic block or a test wants, in one object. */
    summary() {
        return {
            supply: this.supplyVolts(),
            coolant: this.coolantDegC(),
            intakeAir: this.intakeAirDegC(),
            engineSpeed: this.engineSpeedRpm(),
            load: this.normalizedLoad(),
            hystereticChannel: this.raw(memory_map_ts_1.IDATA.hystereticChannel),
            unresolvedChannel: this.raw(memory_map_ts_1.IDATA.unresolvedChannel),
            filteredAirMass: this.filteredAirMass(),
        };
    }
}
exports.SensorState = SensorState;
