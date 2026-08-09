"use strict";
/**
 * Timer-1 supervision, CODE:001b -> 2050 -> 257d.
 *
 * "Timer 1 enters 257d, refreshes the watchdog, reloads TH1/TL1, raises
 * BITS:002d, and decrements heartbeat INTMEM:0068. Expiry reaches restart."
 *
 * The heartbeat is a countdown that some other part of the system is expected
 * to reload; if nothing does, it reaches zero and the supervisor restarts
 * software control. That is the specification's "expiry reaches restart", and
 * it is the one place in this model where a missed deadline is fatal.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Timer1Supervisor = void 0;
const assumptions_ts_1 = require("../assumptions.js");
const memory_map_ts_1 = require("../memory-map.js");
class Timer1Supervisor {
    services = 0;
    machine;
    restart;
    constructor(machine, restart) {
        this.machine = machine;
        this.restart = restart;
    }
    initialise() {
        this.machine.idata.write(memory_map_ts_1.IDATA.heartbeat, this.machine.assumptions.heartbeatReload);
        this.machine.idata.setBit(memory_map_ts_1.BITS.timer1Serviced, false);
    }
    /** CODE:257d. */
    service() {
        const { idata, watchdog, timer1, assumptions } = this.machine;
        watchdog.refresh();
        timer1.reloadForPeriod((0, assumptions_ts_1.msToTicks)(assumptions, assumptions.timer1PeriodMs));
        idata.setBit(memory_map_ts_1.BITS.timer1Serviced, true);
        this.services += 1;
        const { expired } = idata.decrementToZero(memory_map_ts_1.IDATA.heartbeat);
        if (expired)
            this.restart('recovery-2564');
    }
    /** The foreground cycle proves it is still running. */
    kick() {
        this.machine.idata.write(memory_map_ts_1.IDATA.heartbeat, this.machine.assumptions.heartbeatReload);
    }
    heartbeat() {
        return this.machine.idata.read(memory_map_ts_1.IDATA.heartbeat);
    }
}
exports.Timer1Supervisor = Timer1Supervisor;
