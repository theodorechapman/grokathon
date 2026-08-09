/**
 * A short drive cycle: cold start, idle, part load, and an over-rev.
 *
 * Run with `node examples/drive-cycle.ts`. Every engineering number printed
 * here rests on an assumption; `disclosure()` says which one.
 */

import { createEcu } from '../src/index.ts';
import { disclosure, OPEN_QUESTIONS } from '../src/disclosure.ts';
import { BITS, IDATA, XRAM } from '../src/memory-map.ts';

const ecu = createEcu();
const start = ecu.powerOn();

console.log('reset trace  ', start.trace.map((a) => a.toString(16).padStart(4, '0')).join(' -> '));
console.log('watchdog reset', start.watchdogReset, ' warm start', start.warmStart);
console.log('checksum      ', ecu.parts.integrity.verifyChecksum());

// Sensor inputs: 8-bit ADC levels on the channels the scan sweeps.
ecu.setAnalogInput(1, 0xa0); // supply
ecu.setAnalogInput(2, 0x90); // intake air
ecu.setAnalogInput(3, 0xbb); // coolant, cold (~20 C under the assumed conversion)
ecu.setAnalogInput(4, 0x80);
ecu.setAnalogInput(5, 0x80);

/** Bench-side air flow: rises with speed and throttle, as a real AFM would. */
const REDLINE = 6500;
const afmByte = (rpm: number, throttle: number): number =>
  Math.min(0xff, Math.round(0xff * throttle * (rpm / REDLINE)));

const report = (label: string) => {
  const fuel = ecu.parts.fuel.latest();
  const ignition = ecu.parts.ignition.latest();
  const speed = ecu.parts.sync.speed();
  console.log(
    `${label.padEnd(12)}` +
      ` rpm=${(speed?.rpm ?? 0).toFixed(0).padStart(5)}` +
      ` mode=${ecu.parts.load.operatingMode().padEnd(19)}` +
      ` load=0x${ecu.machine.idata.read(IDATA.normalizedLoad).toString(16).padStart(2, '0')}` +
      ` fuel=${fuel?.pulseWidthMs.toFixed(2).padStart(5)}ms` +
      ` adv=${(ignition?.advanceDegBtdc ?? 0).toFixed(1).padStart(5)}deg` +
      ` dwell=${(ignition?.dwellMs ?? 0).toFixed(2)}ms` +
      (fuel?.cut ? `  CUT: ${fuel.cutReason}` : ''),
  );
};

ecu.parts.idle.setInputs({ parkNeutral: true, airConditioning: false });

const drive = (label: string, rpm: number, throttle: number, ms = 300) => {
  ecu.setAnalogInput(0, afmByte(rpm, throttle));
  ecu.spinCrank(rpm, ms);
  report(label);
};

drive('idle', 850, 0.08);
drive('part load', 3000, 0.35);
drive('wide open', 5200, 1.0);
drive('over-rev', 6800, 1.0, 200);

console.log('\nrev-limit records (raw, as SPECS is willing to state them):');
for (const record of ecu.parts.limiter.rawRecords()) {
  console.log(
    `  base=0x${record.base.toString(16)} limit=0x${record.limit.toString(16)}` +
      ` buffer=0x${record.buffer.toString(16)} consumed=${record.consumed}`,
  );
}
console.log('  limiter state', ecu.parts.limiter.state());
console.log('  BITS:0038', ecu.machine.idata.getBit(BITS.revCutStageActive));
console.log('  XRAM:0207-0209', [...ecu.machine.xram.slice(XRAM.revLimitCopyBase, 3)]);

console.log('\ninterrupts   ', ecu.interruptCounts());
console.log('foreground   ', ecu.executive.cycles, 'cycles,', ecu.machine.events.length, 'output events');

const assumed = disclosure().filter((entry) => entry.kind === 'assumed');
console.log(`\nthis run rests on ${assumed.length} assumptions and ${OPEN_QUESTIONS.length} open questions.`);
console.log('sample:', assumed.slice(0, 3).map((a) => `${a.field}=${a.value}`).join(', '));
