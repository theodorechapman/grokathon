import type { Ecu } from '../../../../../cleanroom/src/ecu.ts';
import { BITS, IDATA, XRAM } from '../../../../../cleanroom/src/memory-map.ts';

import type { TraceEvent } from './audit-types.ts';

interface Snapshot {
  idata: Uint8Array;
  xdata: Uint8Array;
  sfr: Uint8Array;
  interrupts: Record<string, number>;
  executiveCycles: number;
  state: Record<string, unknown>;
}

const hex = (value: number, width = 2): string => value.toString(16).padStart(width, '0');

export class TraceAdapter {
  readonly events: TraceEvent[] = [];
  private outputIndex = 0;
  private portIndex = 0;
  private readonly ecu: Ecu;
  private readonly profile: string;

  constructor(ecu: Ecu, profile: string) {
    this.ecu = ecu;
    this.profile = profile;
    this.events.push({
      kind: 'provenance',
      cycles: 0,
      source: 'cleanroom-trace-adapter',
      profile,
      runtime: true,
      detail: {
        image: 'synthetic-cleanroom-rom',
        qualification: 'model execution, not canonical ROM runtime',
      },
    });
    this.events.push({
      kind: 'run',
      cycles: 0,
      source: 'cleanroom-model-runtime',
      profile,
      runtime: true,
    });
  }

  perform(name: string, detail: Record<string, unknown>, action: () => void): void {
    const before = this.snapshot();
    this.events.push({
      kind: 'input',
      cycles: this.ecu.machine.now(),
      source: 'scenario-fixture',
      profile: this.profile,
      name,
      detail,
    });
    action();
    const after = this.snapshot();
    this.emitMemoryDiff('idata', before.idata, after.idata, 0);
    this.emitMemoryDiff('xdata', before.xdata, after.xdata, 0);
    this.emitMemoryDiff('sfr', before.sfr, after.sfr, 0x80);
    this.emitInterrupts(before.interrupts, after.interrupts);
    this.emitServices(before.executiveCycles, after.executiveCycles);
    this.emitStates(before.state, after.state);
    this.emitPorts();
    this.emitOutputs();
  }

  private snapshot(): Snapshot {
    const { machine, executive } = this.ecu;
    return {
      idata: machine.idata.snapshot(),
      xdata: machine.xram.snapshot(),
      sfr: machine.sfr.snapshot(),
      interrupts: this.ecu.interruptCounts(),
      executiveCycles: executive.cycles,
      state: {
        sync: machine.idata.read(IDATA.syncState),
        modeBits: (machine.xram.read(XRAM.modeField) >> 3) & 7,
        revCut: machine.idata.getBit(BITS.revCutStageActive),
        overrun: machine.idata.getBit(BITS.overrunActive),
        diagPhase: machine.idata.read(IDATA.diagPhase),
        faultCount: machine.xram.read(XRAM.faultCount),
        heartbeat: machine.idata.read(IDATA.heartbeat),
      },
    };
  }

  private emitMemoryDiff(
    space: 'idata' | 'xdata' | 'sfr',
    before: Uint8Array,
    after: Uint8Array,
    offset: number,
  ): void {
    for (let index = 0; index < after.length; index += 1) {
      if (before[index] === after[index]) continue;
      this.events.push({
        kind: 'access',
        cycles: this.ecu.machine.now(),
        source: 'cleanroom-state-diff',
        profile: this.profile,
        space,
        access: 'write',
        address: hex(index + offset, space === 'xdata' ? 4 : 2),
        data: hex(after[index]),
        detail: { before: hex(before[index]) },
      });
    }
  }

  private emitInterrupts(before: Record<string, number>, after: Record<string, number>): void {
    for (const [name, count] of Object.entries(after)) {
      const delta = count - (before[name] ?? 0);
      for (let occurrence = 0; occurrence < delta; occurrence += 1) {
        this.events.push({
          kind: 'interrupt',
          cycles: this.ecu.machine.now(),
          source: 'cleanroom-interrupt-dispatch',
          profile: this.profile,
          name,
        });
      }
    }
  }

  private emitServices(before: number, after: number): void {
    for (let cycle = before; cycle < after; cycle += 1) {
      for (const name of this.ecu.executive.serviceNames()) {
        this.events.push({
          kind: 'service',
          cycles: this.ecu.machine.now(),
          source: 'cleanroom-foreground-model-order',
          profile: this.profile,
          name,
          detail: { executiveCycle: cycle + 1 },
        });
      }
    }
  }

  private emitStates(before: Record<string, unknown>, after: Record<string, unknown>): void {
    for (const [name, value] of Object.entries(after)) {
      if (before[name] === value) continue;
      this.events.push({
        kind: 'state',
        cycles: this.ecu.machine.now(),
        source: 'cleanroom-state-transition',
        profile: this.profile,
        name,
        before: before[name],
        after: value,
      });
    }
  }

  private emitPorts(): void {
    const transitions = this.ecu.machine.ports.transitions;
    if (this.portIndex > transitions.length) this.portIndex = 0;
    for (; this.portIndex < transitions.length; this.portIndex += 1) {
      const edge = transitions[this.portIndex];
      this.events.push({
        kind: 'access',
        cycles: this.ecu.machine.now(),
        source: 'cleanroom-port-edge',
        profile: this.profile,
        space: 'port',
        access: 'write',
        address: `P1.${edge.bit}`,
        data: edge.value ? '1' : '0',
      });
    }
  }

  private emitOutputs(): void {
    const outputs = this.ecu.machine.events;
    if (this.outputIndex > outputs.length) this.outputIndex = 0;
    for (; this.outputIndex < outputs.length; this.outputIndex += 1) {
      const output = outputs[this.outputIndex];
      this.events.push({
        kind: 'output',
        cycles: output.at,
        source: 'cleanroom-output-event',
        profile: this.profile,
        name: output.kind,
        detail: {
          channel: output.channel,
          durationTicks: output.durationTicks ?? null,
          ...(output.detail ?? {}),
        },
      });
    }
  }
}
