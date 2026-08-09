/**
 * Actuator tests.
 *
 * Proven: "CODE:8bac also decodes six actuator requests (03, 20, 1d, 24, 25,
 * 30). Periodic service 8000 drives CC3/P1.3, CC2/P1.2, routine 6db6, XRAM
 * output bits, or internal flags. Their physical actuator names remain
 * unresolved."
 *
 * The six request codes and the five kinds of target are the specification's.
 * Which request drives which target is not stated, so the pairing below is
 * model-assigned — and since the physical actuator names are unresolved, no
 * request here claims to move a specific part of the engine.
 */

import { XRAM } from '../memory-map.ts';
import { NAMED_PORT_BITS } from '../hardware/digital-ports.ts';
import type { EcuContext } from '../context.ts';

export type ActuatorTarget =
  | { kind: 'compare-and-port'; channel: 2 | 3; portBit: number }
  | { kind: 'routine'; address: number }
  | { kind: 'xram-bit'; address: number; bit: number }
  | { kind: 'internal-flag'; name: string };

export interface ActuatorRequest {
  code: number;
  target: ActuatorTarget;
  /** Always 'model': the request-to-target pairing is not recovered. */
  pairing: 'model';
}

export const ACTUATOR_REQUESTS: readonly ActuatorRequest[] = [
  {
    code: 0x03,
    target: { kind: 'compare-and-port', channel: 3, portBit: NAMED_PORT_BITS.p1_3 },
    pairing: 'model',
  },
  {
    code: 0x20,
    target: { kind: 'compare-and-port', channel: 2, portBit: NAMED_PORT_BITS.p1_2 },
    pairing: 'model',
  },
  { code: 0x1d, target: { kind: 'routine', address: 0x6db6 }, pairing: 'model' },
  { code: 0x24, target: { kind: 'xram-bit', address: XRAM.fallbackCellA, bit: 0 }, pairing: 'model' },
  { code: 0x25, target: { kind: 'xram-bit', address: XRAM.fallbackCellB, bit: 0 }, pairing: 'model' },
  { code: 0x30, target: { kind: 'internal-flag', name: 'actuator-flag' }, pairing: 'model' },
];

export class ActuatorTests {
  private readonly flags = new Set<string>();
  /** Codes currently being driven by the periodic service. */
  private readonly running = new Set<number>();

  private readonly context: EcuContext;

  constructor(context: EcuContext) {
    this.context = context;
  }

  /** CODE:8bac — decode a request. Unknown codes are rejected, not guessed. */
  accept(code: number): boolean {
    const request = ACTUATOR_REQUESTS.find((r) => r.code === code);
    if (!request) return false;
    this.running.add(code);
    return true;
  }

  stop(code: number): void {
    this.running.delete(code);
  }

  stopAll(): void {
    this.running.clear();
  }

  isRunning(code: number): boolean {
    return this.running.has(code);
  }

  /** CODE:8000 — the periodic service that actually drives the targets. */
  servicePeriodic(): void {
    for (const code of this.running) {
      const request = ACTUATOR_REQUESTS.find((r) => r.code === code);
      if (!request) continue;
      this.drive(request);
    }
  }

  private drive(request: ActuatorRequest): void {
    const { machine } = this.context;
    const target = request.target;
    switch (target.kind) {
      case 'compare-and-port':
        machine.ports.setP1(target.portBit, !machine.ports.getP1(target.portBit));
        machine.emit({
          kind: 'actuator-test',
          channel: `compare-${target.channel}/P1.${target.portBit}`,
          detail: { request: request.code },
        });
        break;
      case 'routine':
        machine.emit({
          kind: 'actuator-test',
          channel: `routine-${target.address.toString(16)}`,
          detail: { request: request.code },
        });
        break;
      case 'xram-bit':
        machine.xram.write(target.address, machine.xram.read(target.address) ^ (1 << target.bit));
        machine.emit({
          kind: 'actuator-test',
          channel: `xram-${target.address.toString(16)}.${target.bit}`,
          detail: { request: request.code },
        });
        break;
      case 'internal-flag':
        if (this.flags.has(target.name)) this.flags.delete(target.name);
        else this.flags.add(target.name);
        machine.emit({
          kind: 'actuator-test',
          channel: target.name,
          detail: { request: request.code, set: this.flags.has(target.name) },
        });
        break;
    }
  }

  flagSet(name: string): boolean {
    return this.flags.has(name);
  }
}
