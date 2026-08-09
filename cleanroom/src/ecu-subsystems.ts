/**
 * Subsystem construction and wiring.
 *
 * The dependency edges here are the ones the specification proves: capture
 * feeds sync, sync feeds load, load feeds the calibrated-control cluster, the
 * limiter and overrun latch gate fuel, monitors gate adaptation, and the
 * diagnostic session reaches fault memory, the sensors and the actuator tests.
 */

import type { EcuContext } from './context.ts';
import type { Subsystems } from './ecu-services.ts';
import { AdcAcquisition } from './subsystems/adc-acquisition.ts';
import { Adaptation } from './subsystems/adaptation.ts';
import { AirMassFilter } from './subsystems/air-mass.ts';
import { CrankCapture } from './subsystems/crank-capture.ts';
import { CrankSync } from './subsystems/crank-sync.ts';
import { EngineLoad } from './subsystems/engine-load.ts';
import { FaultMemory } from './subsystems/fault-memory.ts';
import { FaultMonitors } from './subsystems/fault-monitors.ts';
import { FuelControl } from './subsystems/fuel-control.ts';
import { IdleControl } from './subsystems/idle-control.ts';
import { IgnitionControl } from './subsystems/ignition-control.ts';
import { ChunkedChecksum, IntegrityChecks } from './subsystems/integrity.ts';
import { OverrunLatch } from './subsystems/overrun-latch.ts';
import { RevLimiter } from './subsystems/rev-limiter.ts';
import { SensorState } from './subsystems/sensor-state.ts';
import { ActuatorTests } from './diagnostics/kw71-actuators.ts';
import { Kw71Session } from './diagnostics/kw71-session.ts';
import { Kw71Uart } from './diagnostics/kw71-uart.ts';

export interface Initialisable {
  initialise(): void;
}

export interface SubsystemBundle extends Subsystems {
  sensors: SensorState;
  capture: CrankCapture;
  integrity: IntegrityChecks;
  uart: Kw71Uart;
  initialisable: Initialisable[];
}

export const buildSubsystems = (context: EcuContext): SubsystemBundle => {
  const adc = new AdcAcquisition(context);
  const sensors = new SensorState(context.machine.idata, context.assumptions);
  const airMass = new AirMassFilter(context, adc);
  const capture = new CrankCapture(context);
  const faults = new FaultMemory(context.machine.xram);
  const monitors = new FaultMonitors(context, faults);
  const integrity = new IntegrityChecks(context);
  const checksum = new ChunkedChecksum(integrity, context.machine.rom);

  // `sync` needs the ignition scheduler and `ignition` needs the operating
  // mode, so the capture-to-schedule edge is closed with a late binding.
  let ignition: IgnitionControl;
  const sync = new CrankSync(context, capture, (period) => ignition.schedule(period));
  const load = new EngineLoad(context, airMass, sync);
  const limiter = new RevLimiter(context, sync);
  const overrun = new OverrunLatch(context, load, sync);

  ignition = new IgnitionControl(context, load, () =>
    limiter.isCutting()
      ? { suppress: true, reason: 'rev cut stage active (BITS:0038)' }
      : { suppress: false, reason: null },
  );

  const fuel = new FuelControl(context, load, () => {
    if (limiter.isCutting()) return { cut: true, reason: 'rev cut stage active (BITS:0038)' };
    if (overrun.isActive()) return { cut: true, reason: 'overrun latch set (BITS:003b)' };
    return { cut: false, reason: null };
  });

  const idle = new IdleControl(context, load, sync);
  const adaptation = new Adaptation(context, load, () => monitors.anyActive());

  const uart = new Kw71Uart(context);
  const actuators = new ActuatorTests(context);
  const session = new Kw71Session(context, uart, { context, faults, sensors, actuators });

  return {
    adc,
    sensors,
    airMass,
    capture,
    sync,
    load,
    fuel,
    ignition,
    idle,
    limiter,
    overrun,
    adaptation,
    faults,
    monitors,
    integrity,
    checksum,
    uart,
    session,
    actuators,
    initialisable: [capture, sync, airMass, limiter, overrun, adaptation, session],
  };
};
