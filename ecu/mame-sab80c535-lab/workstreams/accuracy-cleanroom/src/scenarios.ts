import { createEcu, type Ecu } from '../../../../../cleanroom/src/ecu.ts';
import { msToTicks } from '../../../../../cleanroom/src/assumptions.ts';
import { IDATA, XRAM } from '../../../../../cleanroom/src/memory-map.ts';

import type { ScenarioResult } from './audit-types.ts';
import { TraceAdapter } from './trace-adapter.ts';

export const SCENARIO_NAMES = [
  'cold-boot',
  'warm-boot',
  'stopped',
  'cranking',
  'sync',
  'idle',
  'part-load',
  'wide-open-throttle',
  'overrun',
  'rev-limit',
  'timer-rollover',
  'adc-rails',
  'watchdog-expiry',
  'malformed-diagnostics',
  'missing-tooth-fault',
] as const;

export type ScenarioName = (typeof SCENARIO_NAMES)[number];

const powerOn = (ecu: Ecu, trace: TraceAdapter): void => {
  trace.perform('power-on', {}, () => void ecu.powerOn());
};

const setHealthyAnalog = (ecu: Ecu, afm: number): void => {
  ecu.setAnalogInput(0, afm);
  for (const channel of [1, 2, 3, 4, 5]) ecu.setAnalogInput(channel, 0x80);
};

const drive = (ecu: Ecu, trace: TraceAdapter, rpm: number, afm: number, milliseconds = 120): void => {
  trace.perform('set-analog-bank', { afm, channels1to5: 0x80 }, () => setHealthyAnalog(ecu, afm));
  trace.perform('crank-train', { rpm, milliseconds }, () => ecu.spinCrank(rpm, milliseconds));
};

const commonObservations = (ecu: Ecu): Record<string, unknown> => ({
  clockTicks: ecu.machine.now(),
  syncState: ecu.parts.sync.state(),
  syncLocked: ecu.parts.sync.isLocked(),
  lossOfSyncCount: ecu.parts.sync.lossOfSyncCount,
  speedRpm: ecu.parts.sync.speed()?.rpm ?? null,
  operatingMode: ecu.parts.load.operatingMode(),
  encodedSpeed: ecu.machine.idata.read(IDATA.encodedEngineSpeed),
  normalizedLoad: ecu.machine.idata.read(IDATA.normalizedLoad),
  timer2Epoch: ecu.machine.idata.read(IDATA.timer2OverflowEpoch),
  limiter: ecu.parts.limiter.state(),
  overrun: { active: ecu.parts.overrun.isActive(), timer: ecu.parts.overrun.timer() },
  diagPhase: ecu.parts.session.phase(),
  faultCount: ecu.parts.faults.count(),
  heartbeat: ecu.supervisor.heartbeat(),
  executiveCycles: ecu.executive.cycles,
  restarts: [...ecu.restarts],
  outputs: ecu.machine.events.length,
});

const execute = (name: ScenarioName): ScenarioResult => {
  const ecu = createEcu();
  const trace = new TraceAdapter(ecu, name);
  let scenarioObservation: Record<string, unknown> = {};

  switch (name) {
    case 'cold-boot': {
      let outcome: ReturnType<Ecu['powerOn']>;
      trace.perform('power-on', {}, () => { outcome = ecu.powerOn(); });
      scenarioObservation = { outcome: outcome! };
      break;
    }
    case 'warm-boot': {
      powerOn(ecu, trace);
      let outcome: ReturnType<Ecu['powerOn']>;
      trace.perform('second-power-on-with-retained-xram', {}, () => { outcome = ecu.powerOn(); });
      scenarioObservation = { outcome: outcome!, retainedCounter: ecu.machine.xram.read(XRAM.retainedCounter) };
      break;
    }
    case 'stopped':
      powerOn(ecu, trace);
      trace.perform('elapsed-without-capture', { milliseconds: 30 }, () => ecu.runFor(30));
      break;
    case 'cranking':
      powerOn(ecu, trace);
      drive(ecu, trace, 250, 0x12);
      break;
    case 'sync':
      powerOn(ecu, trace);
      drive(ecu, trace, 1200, 0x30);
      break;
    case 'idle':
      powerOn(ecu, trace);
      drive(ecu, trace, 850, 0x04, 180);
      break;
    case 'part-load':
      powerOn(ecu, trace);
      drive(ecu, trace, 3000, 0x40, 180);
      break;
    case 'wide-open-throttle':
      powerOn(ecu, trace);
      drive(ecu, trace, 5200, 0xff, 180);
      break;
    case 'overrun':
      powerOn(ecu, trace);
      drive(ecu, trace, 2200, 0x01, 180);
      break;
    case 'rev-limit':
      powerOn(ecu, trace);
      drive(ecu, trace, 7000, 0x80, 180);
      break;
    case 'timer-rollover':
      powerOn(ecu, trace);
      trace.perform('advance-near-timer2-rollover', { ticks: 0xfffd }, () => {
        ecu.machine.watchdog.stop();
        ecu.machine.advance(0xfffd);
      });
      trace.perform('capture-before-rollover', {}, () => ecu.crankEvent());
      trace.perform('cross-timer2-rollover', { ticks: 5 }, () => ecu.machine.advance(5));
      trace.perform('capture-after-rollover', {}, () => ecu.crankEvent());
      break;
    case 'adc-rails':
      powerOn(ecu, trace);
      trace.perform('drive-adc-rails', { low: 0, high: 0xff }, () => {
        for (const channel of [1, 3, 5]) ecu.setAnalogInput(channel, 0);
        for (const channel of [2, 4]) ecu.setAnalogInput(channel, 0xff);
      });
      trace.perform('qualify-rail-faults', { passes: 4 }, () => {
        for (let pass = 0; pass < 4; pass += 1) {
          ecu.parts.adc.scan();
          ecu.parts.monitors.checkChannels();
        }
      });
      break;
    case 'watchdog-expiry':
      powerOn(ecu, trace);
      trace.perform('mask-interrupts-and-expire-watchdog', {}, () => {
        ecu.machine.interrupts.globalEnable(false);
        ecu.machine.advance(ecu.machine.watchdog.remainingTicks() + 1);
      });
      break;
    case 'malformed-diagnostics':
      powerOn(ecu, trace);
      trace.perform('emit-sync', {}, () => ecu.parts.session.service());
      trace.perform('accept-handshake', { byte: 0x06 }, () => {
        ecu.receiveDiagnosticByte(0x06);
        ecu.parts.session.service();
      });
      trace.perform('oversize-length', { byte: 0x11 }, () => {
        ecu.receiveDiagnosticByte(0x11);
        ecu.parts.session.service();
      });
      break;
    case 'missing-tooth-fault':
      powerOn(ecu, trace);
      drive(ecu, trace, 1600, 0x30, 100);
      trace.perform('missing-capture-window', { milliseconds: 30 }, () => ecu.runFor(30));
      break;
  }

  return {
    name,
    qualification: 'cleanroom-model-execution',
    events: trace.events
      .map((event, index) => ({ event, index }))
      .sort((left, right) => {
        if (left.event.kind === 'provenance') return -1;
        if (right.event.kind === 'provenance') return 1;
        return left.event.cycles - right.event.cycles || left.index - right.index;
      })
      .map(({ event }) => event),
    observations: { ...commonObservations(ecu), ...scenarioObservation },
  };
};

export const runScenario = (name: ScenarioName): ScenarioResult => execute(name);

export const runAllScenarios = (): ScenarioResult[] => SCENARIO_NAMES.map(execute);

export const fixedCaptureTicks = (ecu: Ecu, ticks: number, count: number): void => {
  for (let index = 0; index < count; index += 1) {
    ecu.step(ticks);
    ecu.crankEvent();
  }
};

export const watchdogTimeoutTicks = (ecu: Ecu): number =>
  msToTicks(ecu.context.assumptions, ecu.context.assumptions.watchdogTimeoutMs);
