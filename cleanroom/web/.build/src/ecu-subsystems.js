"use strict";
/**
 * Subsystem construction and wiring.
 *
 * The dependency edges here are the ones the specification proves: capture
 * feeds sync, sync feeds load, load feeds the calibrated-control cluster, the
 * limiter and overrun latch gate fuel, monitors gate adaptation, and the
 * diagnostic session reaches fault memory, the sensors and the actuator tests.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSubsystems = void 0;
const adc_acquisition_ts_1 = require("./subsystems/adc-acquisition.js");
const adaptation_ts_1 = require("./subsystems/adaptation.js");
const air_mass_ts_1 = require("./subsystems/air-mass.js");
const crank_capture_ts_1 = require("./subsystems/crank-capture.js");
const crank_sync_ts_1 = require("./subsystems/crank-sync.js");
const engine_load_ts_1 = require("./subsystems/engine-load.js");
const fault_memory_ts_1 = require("./subsystems/fault-memory.js");
const fault_monitors_ts_1 = require("./subsystems/fault-monitors.js");
const fuel_control_ts_1 = require("./subsystems/fuel-control.js");
const idle_control_ts_1 = require("./subsystems/idle-control.js");
const ignition_control_ts_1 = require("./subsystems/ignition-control.js");
const integrity_ts_1 = require("./subsystems/integrity.js");
const overrun_latch_ts_1 = require("./subsystems/overrun-latch.js");
const rev_limiter_ts_1 = require("./subsystems/rev-limiter.js");
const sensor_state_ts_1 = require("./subsystems/sensor-state.js");
const kw71_actuators_ts_1 = require("./diagnostics/kw71-actuators.js");
const kw71_session_ts_1 = require("./diagnostics/kw71-session.js");
const kw71_uart_ts_1 = require("./diagnostics/kw71-uart.js");
const buildSubsystems = (context) => {
    const adc = new adc_acquisition_ts_1.AdcAcquisition(context);
    const sensors = new sensor_state_ts_1.SensorState(context.machine.idata, context.assumptions);
    const airMass = new air_mass_ts_1.AirMassFilter(context, adc);
    const capture = new crank_capture_ts_1.CrankCapture(context);
    const faults = new fault_memory_ts_1.FaultMemory(context.machine.xram);
    const monitors = new fault_monitors_ts_1.FaultMonitors(context, faults);
    const integrity = new integrity_ts_1.IntegrityChecks(context);
    const checksum = new integrity_ts_1.ChunkedChecksum(integrity, context.machine.rom);
    // `sync` needs the ignition scheduler and `ignition` needs the operating
    // mode, so the capture-to-schedule edge is closed with a late binding.
    let ignition;
    const sync = new crank_sync_ts_1.CrankSync(context, capture, (period) => ignition.schedule(period));
    const load = new engine_load_ts_1.EngineLoad(context, airMass, sync);
    const limiter = new rev_limiter_ts_1.RevLimiter(context, sync);
    const overrun = new overrun_latch_ts_1.OverrunLatch(context, load, sync);
    ignition = new ignition_control_ts_1.IgnitionControl(context, load, () => limiter.isCutting()
        ? { suppress: true, reason: 'rev cut stage active (BITS:0038)' }
        : { suppress: false, reason: null });
    const fuel = new fuel_control_ts_1.FuelControl(context, load, () => {
        if (limiter.isCutting())
            return { cut: true, reason: 'rev cut stage active (BITS:0038)' };
        if (overrun.isActive())
            return { cut: true, reason: 'overrun latch set (BITS:003b)' };
        return { cut: false, reason: null };
    });
    const idle = new idle_control_ts_1.IdleControl(context, load, sync);
    const adaptation = new adaptation_ts_1.Adaptation(context, load, () => monitors.anyActive());
    const uart = new kw71_uart_ts_1.Kw71Uart(context);
    const actuators = new kw71_actuators_ts_1.ActuatorTests(context);
    const session = new kw71_session_ts_1.Kw71Session(context, uart, { context, faults, sensors, actuators });
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
exports.buildSubsystems = buildSubsystems;
