"use strict";
/**
 * The bench: one real `Ecu`, stepped in real time, with the stimulus wired in.
 *
 * The controller is never simulated or replayed here. `ecu.step()` advances the
 * machine, `ecu.crankEvent()` raises the external-3/CC0 capture, and
 * `ecu.setAnalogInput()` drives the converter. Everything the page shows comes
 * back out of the model's own memory.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBench = void 0;
const assumptions_ts_1 = require("../../src/assumptions.js");
const kw71_services_ts_1 = require("../../src/diagnostics/kw71-services.js");
const disclosure_ts_1 = require("../../src/disclosure.js");
const ecu_ts_1 = require("../../src/ecu.js");
const reset_ts_1 = require("../../src/kernel/reset.js");
const speed_estimate_ts_1 = require("../../src/subsystems/speed-estimate.js");
const engine_plant_ts_1 = require("./engine-plant.js");
const snapshot_ts_1 = require("./snapshot.js");
/** Bench-side sensor levels, in ADC counts. Not model values. */
const SUPPLY_RAW = 0xa0;
const INTAKE_AIR_RAW = 0xa0;
const COOLANT_COLD_RAW = 0xba;
const COOLANT_WARM_RAW = 0x64;
const WARMUP_SECONDS = 45;
const AFM_REDLINE = 6500;
/** The scope only looks 30 ms back; keep a little more than that, and cap it. */
const TRACE_RETENTION_MS = 200;
const TRACE_LIMIT = 4000;
const MAX_FRAME_SECONDS = 0.05;
const createBench = () => {
    const plant = (0, engine_plant_ts_1.createEnginePlant)();
    let assumptions = { ...assumptions_ts_1.DEFAULT_ASSUMPTIONS };
    let ecu = (0, ecu_ts_1.createEcu)({ assumptions });
    let running = false;
    let throttle = 0;
    let brake = 0;
    let runSeconds = 0;
    let untilCapture = 0;
    let trace = [];
    const listeners = [];
    const romIdentity = (0, kw71_services_ts_1.readIdentity)(ecu.machine.rom);
    const identity = {
        backend: 'cleanroom',
        controller: 'Bosch Motronic 1.7',
        processor: 'Siemens SAB80C515 clean-room model',
        bosch: romIdentity.bosch,
        software: romIdentity.software,
        checksum: ecu.parts.integrity.verifyChecksum(),
        resetTrace: reset_ts_1.RESET_TRACE,
    };
    const applySensors = () => {
        const warm = Math.min(1, runSeconds / WARMUP_SECONDS);
        const coolant = Math.round(COOLANT_COLD_RAW + (COOLANT_WARM_RAW - COOLANT_COLD_RAW) * warm);
        ecu.setAnalogInput(1, SUPPLY_RAW);
        ecu.setAnalogInput(2, INTAKE_AIR_RAW);
        ecu.setAnalogInput(3, coolant);
        ecu.setAnalogInput(4, 0x80);
        ecu.setAnalogInput(5, 0x80);
        // Bench-side air flow: rises with speed and throttle, as an AFM flap would.
        const afm = Math.min(0xff, Math.round(0xff * throttle * (plant.rpm() / AFM_REDLINE)));
        ecu.setAnalogInput(0, afm);
    };
    const drainOutputs = () => {
        for (const event of ecu.machine.events.splice(0)) {
            if (event.kind === 'restart' || event.kind === 'fault' || event.kind === 'actuator-test') {
                continue;
            }
            const lane = event.kind === 'injector'
                ? 'cc2-cc3-schedule'
                : event.kind === 'coil-charge'
                    ? 'ignition-charge'
                    : event.kind === 'coil-fire'
                        ? 'p15-ignition'
                        : 'idle-actuator';
            trace.push({
                lane,
                at: (0, assumptions_ts_1.ticksToMs)(assumptions, event.at),
                durationMs: (0, assumptions_ts_1.ticksToMs)(assumptions, event.durationTicks ?? 0),
            });
        }
        const cutoff = ecu.machine.ms() - TRACE_RETENTION_MS;
        let first = 0;
        while (first < trace.length && trace[first].at < cutoff)
            first += 1;
        if (first > 0)
            trace = trace.slice(first);
        if (trace.length > TRACE_LIMIT)
            trace = trace.slice(-TRACE_LIMIT);
    };
    /** The crank loop `spinCrank` runs, with the capture instants kept. */
    const spin = (milliseconds, plantRpm) => {
        let remaining = (0, assumptions_ts_1.msToTicks)(assumptions, milliseconds);
        const period = (0, speed_estimate_ts_1.periodForRpm)(assumptions, plantRpm);
        if (period <= 0) {
            ecu.step(remaining);
            return;
        }
        if (untilCapture <= 0 || untilCapture > period)
            untilCapture = period;
        while (remaining > 0) {
            const slice = Math.min(remaining, untilCapture);
            ecu.step(slice);
            remaining -= slice;
            untilCapture -= slice;
            if (untilCapture > 0)
                continue;
            ecu.crankEvent();
            trace.push({ lane: 'capture', at: ecu.machine.ms(), durationMs: 0 });
            untilCapture = period;
        }
    };
    const rebuild = () => {
        const wasRunning = running;
        ecu = (0, ecu_ts_1.createEcu)({ assumptions });
        trace = [];
        untilCapture = 0;
        if (wasRunning) {
            ecu.powerOn();
            ecu.parts.idle.setInputs({ parkNeutral: true, airConditioning: false });
            applySensors();
        }
        for (const listener of listeners)
            listener();
    };
    const benchProvenance = () => ({
        mode: 'demo',
        controls: 'read-write',
        assumptions: 'editable',
        qualification: 'cleanroom model execution; not canonical ROM runtime',
        summary: 'The browser runs the local clean-room controller and a disclosed toy engine plant.',
        values: assumptions,
        entries: (0, disclosure_ts_1.disclosure)(assumptions),
        openQuestions: disclosure_ts_1.OPEN_QUESTIONS,
    });
    return {
        identity: () => identity,
        provenance: benchProvenance,
        isRunning: () => running,
        throttle: () => throttle,
        setThrottle: (value) => {
            throttle = Math.min(1, Math.max(0, value));
        },
        brake: () => brake,
        setBrake: (value) => {
            brake = Math.min(1, Math.max(0, value));
        },
        rpm: () => plant.rpm(),
        start: () => {
            if (running)
                return;
            ecu.powerOn();
            ecu.parts.idle.setInputs({ parkNeutral: true, airConditioning: false });
            applySensors();
            running = true;
            runSeconds = 0;
        },
        stop: () => {
            running = false;
            plant.stop();
            rebuild();
        },
        tick: (seconds) => {
            if (!running)
                return;
            const step = Math.min(MAX_FRAME_SECONDS, Math.max(0, seconds));
            if (step === 0)
                return;
            runSeconds += step;
            const fuel = ecu.parts.fuel.latest();
            const fuelled = fuel !== null && !fuel.cut && fuel.pulseCount > 0;
            plant.advance(step, { throttle, brake, cranking: runSeconds < 1.2, fuelled });
            applySensors();
            spin(step * 1000, plant.rpm());
            drainOutputs();
        },
        snapshot: () => (0, snapshot_ts_1.readSnapshot)(ecu),
        trace: () => trace,
        setAssumption: (field, value) => {
            if (!Number.isFinite(value))
                throw new Error(`assumption ${field} needs a finite number`);
            assumptions = { ...assumptions, [field]: value };
            rebuild();
        },
        resetAssumptions: () => {
            assumptions = { ...assumptions_ts_1.DEFAULT_ASSUMPTIONS };
            rebuild();
        },
        onRebuild: (listener) => {
            listeners.push(listener);
        },
    };
};
exports.createBench = createBench;
