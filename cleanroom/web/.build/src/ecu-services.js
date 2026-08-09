"use strict";
/**
 * The fixed service sequence the foreground executive walks.
 *
 * SPECS describes 601a-607d as "a deterministic service sequence" without
 * naming its members, so the order below is the model's — chosen to respect the
 * one ordering the specification does prove: acquisition produces the state
 * that the calibrated-control cluster consumes (AFM -> air mass -> load ->
 * lookup consumers).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildForegroundServices = void 0;
const buildForegroundServices = (s) => [
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
exports.buildForegroundServices = buildForegroundServices;
