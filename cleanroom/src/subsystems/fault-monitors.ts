/**
 * Sensor monitors and fallback behaviour.
 *
 * Proven: "CODE:9158 compares measured channels INTMEM:0036-003a against ROM
 * thresholds. Qualified active records can substitute calibrated defaults and
 * invoke neutralization helpers. CODE:93ff performs additional plausibility
 * checks; 6de3 explicitly restores XRAM 0046 and 0049 to neutral 0x80."
 *
 * Also proven, and reused by the integrity chapter: "ROM and RAM tests report
 * the same fault-table identifier at CODE:4532 with different subtypes: RAM
 * uses 1 and ROM checksum uses 4."
 *
 * The thresholds themselves are not recoverable from the XDF — SPECS: "Exact
 * open-circuit/short-circuit thresholds cannot be named from the XDF because
 * the XDF primarily describes calibrations rather than ADC diagnostic
 * thresholds." The window below is a model choice: rails only, which is the
 * one thing an open or shorted input reliably produces.
 */

import { NEUTRAL } from '../byte-math.ts';
import { IDATA, XRAM } from '../memory-map.ts';
import type { EcuContext } from '../context.ts';
import type { FaultMemory } from './fault-memory.ts';

/** The identifier both integrity tests report, quoted from SPECS. */
export const FAULT_TABLE_IDENTIFIER = 0x4532 & 0xff;

/** Subtypes proven for that identifier. */
export const SUBTYPE = { ramTest: 1, romChecksum: 4 } as const;

export interface MonitoredChannel {
  address: number;
  identifier: number;
  name: string;
  /** Substituted when the channel is faulted and the record is qualified. */
  fallback: number;
}

/** One monitor per measured channel. Identifiers are model-assigned: SPECS
 *  says "Unknown: BMW fault-code names". */
export const MONITORED_CHANNELS: readonly MonitoredChannel[] = [
  { address: IDATA.scaledSupplyVoltage, identifier: 0x11, name: 'supply', fallback: 0xa0 },
  { address: IDATA.intakeAirTemperature, identifier: 0x12, name: 'intake air', fallback: 0x80 },
  { address: IDATA.coolantTemperature, identifier: 0x13, name: 'coolant', fallback: 0x80 },
  { address: IDATA.hystereticChannel, identifier: 0x14, name: 'hysteretic', fallback: NEUTRAL },
  { address: IDATA.unresolvedChannel, identifier: 0x15, name: 'unresolved', fallback: NEUTRAL },
];

/** Rail window. Values at either rail read as open or shorted. */
const LOWER_RAIL = 0x02;
const UPPER_RAIL = 0xfd;

export class FaultMonitors {
  /** Consecutive out-of-range passes per channel, before qualification. */
  private readonly strikes = new Map<number, number>();
  private readonly qualifyAfter = 3;

  private readonly context: EcuContext;
  private readonly faults: FaultMemory;

  constructor(context: EcuContext, faults: FaultMemory) {
    this.context = context;
    this.faults = faults;
  }

  /** CODE:9158 — compare measured channels against thresholds. */
  checkChannels(): void {
    const { idata } = this.context.machine;
    for (const channel of MONITORED_CHANNELS) {
      const value = idata.read(channel.address);
      const bad = value <= LOWER_RAIL || value >= UPPER_RAIL;
      const strikes = bad ? (this.strikes.get(channel.address) ?? 0) + 1 : 0;
      this.strikes.set(channel.address, strikes);

      if (!bad) {
        this.faults.clearActive(channel.identifier);
        continue;
      }
      if (strikes < this.qualifyAfter) continue;

      this.faults.report(channel.identifier, value <= LOWER_RAIL ? 1 : 2, value, 0);
      // A qualified active record substitutes the calibrated default.
      idata.write(channel.address, channel.fallback);
    }
  }

  /** CODE:93ff — additional plausibility checks across channels. */
  checkPlausibility(): void {
    const { idata } = this.context.machine;
    const coolant = idata.read(IDATA.coolantTemperature);
    const intake = idata.read(IDATA.intakeAirTemperature);
    // Both temperature channels sitting at opposite rails cannot both be true.
    if (coolant <= LOWER_RAIL && intake >= UPPER_RAIL) {
      this.faults.report(0x16, 3, coolant, intake);
      this.neutraliseFallbackCells();
    }
  }

  /** CODE:6de3 — restore XRAM 0046 and 0049 to neutral 0x80. */
  neutraliseFallbackCells(): void {
    const { xram } = this.context.machine;
    xram.write(XRAM.fallbackCellA, NEUTRAL);
    xram.write(XRAM.fallbackCellB, NEUTRAL);
  }

  /** True when any monitor holds a currently-active qualified record. This is
   *  what disables adaptation. */
  anyActive(): boolean {
    return this.faults.all().some((record) => ((record.status >> 6) & 1) === 1);
  }
}
