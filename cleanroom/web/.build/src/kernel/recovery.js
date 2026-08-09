"use strict";
/**
 * Software recovery, CODE:2564.
 *
 * "CODE:2564 disables global interrupts, writes XRAM sentinels, invokes 25f7
 * three times, and re-enters 5c00; this is a software recovery or
 * reinitialization path."
 *
 * SPECS will not say what triggers it: "The 2564 -> 5c00 path is firmware proof
 * of recovery, but the triggering fault condition and whether an external
 * watchdog also resets the processor remain unresolved." So this module
 * performs the sequence and records the reason its caller gave; it never
 * decides on its own that recovery is warranted.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.runRecovery = exports.SERVICE_INVOCATIONS = void 0;
const memory_map_ts_1 = require("../memory-map.js");
const startup_ts_1 = require("./startup.js");
/** How many times CODE:2564 invokes the service at 25f7. */
exports.SERVICE_INVOCATIONS = 3;
const runRecovery = (machine, reason, 
/** CODE:25f7 — the service invoked three times before re-entry. */
service) => {
    machine.interrupts.globalEnable(false);
    // Recovery sentinels: the markers are written, so the startup that follows
    // takes the warm path and the retained counter records the event.
    machine.xram.write(memory_map_ts_1.XRAM.startupMarkerA, startup_ts_1.MARKER_A);
    machine.xram.write(memory_map_ts_1.XRAM.startupMarkerB, startup_ts_1.MARKER_B);
    for (let i = 0; i < exports.SERVICE_INVOCATIONS; i += 1)
        service();
    machine.emit({ kind: 'restart', channel: 'recovery-2564', detail: { reason } });
    return { reason, serviceCalls: exports.SERVICE_INVOCATIONS };
};
exports.runRecovery = runRecovery;
