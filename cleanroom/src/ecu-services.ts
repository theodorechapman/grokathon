/**
 * The fixed service sequence the foreground executive walks.
 *
 * SPECS describes 601a-607d as "a deterministic service sequence" without
 * naming its members, so the order below is the model's — chosen to respect the
 * one ordering the specification does prove: acquisition produces the state
 * that the calibrated-control cluster consumes (AFM -> air mass -> load ->
 * lookup consumers).
 */

import type { ForegroundService } from './kernel/foreground-executive.ts';
import type { AdcAcquisition } from './subsystems/adc-acquisition.ts';
import type { Adaptation } from './subsystems/adaptation.ts';
import type { AirMassFilter } from './subsystems/air-mass.ts';
import type { CrankSync } from './subsystems/crank-sync.ts';
import type { EngineLoad } from './subsystems/engine-load.ts';
import type { FaultMemory } from './subsystems/fault-memory.ts';
import type { FaultMonitors } from './subsystems/fault-monitors.ts';
import type { FuelControl } from './subsystems/fuel-control.ts';
import type { IdleControl } from './subsystems/idle-control.ts';
import type { IgnitionControl } from './subsystems/ignition-control.ts';
import type { OverrunLatch } from './subsystems/overrun-latch.ts';
import type { RevLimiter } from './subsystems/rev-limiter.ts';
import type { ChunkedChecksum } from './subsystems/integrity.ts';
import type { ActuatorTests } from './diagnostics/kw71-actuators.ts';
import type { Kw71Session } from './diagnostics/kw71-session.ts';

export interface Subsystems {
  adc: AdcAcquisition;
  airMass: AirMassFilter;
  load: EngineLoad;
  fuel: FuelControl;
  ignition: IgnitionControl;
  idle: IdleControl;
  limiter: RevLimiter;
  overrun: OverrunLatch;
  adaptation: Adaptation;
  faults: FaultMemory;
  monitors: FaultMonitors;
  checksum: ChunkedChecksum;
  session: Kw71Session;
  actuators: ActuatorTests;
  sync: CrankSync;
}

export const buildForegroundServices = (s: Subsystems): ForegroundService[] => [
  { name: 'adc-scan', address: 0x9e88, run: () => s.adc.scan() },
  {
    name: 'air-mass',
    address: 0x2d73,
    run: () => {
      s.airMass.sample();
      s.airMass.update();
    },
  },
  { name: 'engine-load', address: 0x6099, run: () => s.load.update() },
  { name: 'mode-probe', address: 0x3610, run: () => void s.load.probe() },
  { name: 'rev-limiter', address: 0x27cc, run: () => s.limiter.update() },
  { name: 'overrun-latch', address: 0x3723, run: () => s.overrun.update() },
  { name: 'fuel', address: 0x3800, run: () => void s.fuel.update() },
  { name: 'ignition', address: 0x8000, run: () => void s.ignition.update() },
  { name: 'idle', run: () => void s.idle.update() },
  { name: 'adaptation', address: 0x677c, run: () => void s.adaptation.service() },
  {
    name: 'fault-monitors',
    address: 0x9158,
    run: () => {
      s.monitors.checkChannels();
      s.monitors.checkPlausibility();
    },
  },
  { name: 'fault-aging', address: 0x955c, run: () => s.faults.age() },
  { name: 'integrity', address: 0x9016, run: () => void s.checksum.step() },
  { name: 'diagnostics', address: 0x8a1b, run: () => s.session.service() },
  { name: 'actuator-tests', address: 0x8000, run: () => s.actuators.servicePeriodic() },
];
