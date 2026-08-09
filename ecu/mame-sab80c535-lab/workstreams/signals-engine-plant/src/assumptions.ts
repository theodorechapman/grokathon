import type { AssumptionProvenance } from './signal-contract.ts';

export const assumptions: ReadonlyArray<AssumptionProvenance> = [
  {
    id: 'bench-timebase',
    claim:
      'The 10 kHz contract clock is a scheduling grid, not the oscillator, timer clock, or an asserted ECU rate.',
    confidence: 'assumed',
    sources: ['ecu/e2e-analysis/hardware-model.md:121-127'],
    excludes: ['physical time calibration', 'timer prescaling', 'engine-speed units'],
  },
  {
    id: 'xdata-status-baseline',
    claim:
      'A040, A041, and A081 reads default to zero as controlled inputs; A040/A041 output writes remain independent observations.',
    confidence: 'assumed',
    sources: [
      'ecu/mame-sab80c535-lab/workstreams/accuracy-xdata/README.md:28-44',
      'ecu/mame-sab80c535-lab/workstreams/accuracy-xdata/src/motronic175-xdata.cpp:57-72',
    ],
    excludes: ['Bosch ASIC semantics', 'electrical status meaning', 'write readback'],
  },
  {
    id: 'digital-port-pullups',
    claim: 'P3, P5, and P6 input bytes default to FF, matching the current combined harness.',
    confidence: 'assumed',
    sources: ['ecu/mame-sab80c535-lab/workstreams/accuracy-xdata/README.md:30-36'],
    excludes: ['connector voltage', 'individual pin identity', 'external loading'],
  },
  {
    id: 'raw-adc-codes',
    claim:
      'ADC channels are raw unsigned bytes; channel-to-sensor identity and transfer functions are intentionally absent.',
    confidence: 'firmware-proof',
    sources: [
      'ecu/e2e-analysis/subsystems/03-sensor-acquisition.md:5-17',
      'ecu/e2e-analysis/hardware-model.md:48-63',
    ],
    excludes: ['volts', 'temperature', 'pressure', 'physical channel names'],
  },
  {
    id: 'crank-logical-source',
    claim:
      'Falling edges target external-3/CC0 as a crank-like logical source; uniform spacing is a fixture, not recovered tooth geometry.',
    confidence: 'corroborated',
    sources: ['ecu/e2e-analysis/subsystems/02-crank-synchronization-rpm.md:3-35'],
    excludes: ['tooth count', 'missing-tooth pattern', 'cam phase', 'RPM conversion'],
  },
  {
    id: 'scenario-labels',
    claim:
      'Key-on, crank, idle, load, WOT, overrun, and stall are fixture labels for byte/edge profiles, not vehicle simulation claims.',
    confidence: 'assumed',
    sources: [
      'ecu/e2e-analysis/traces/scenarios.json:1-24',
      'cleanroom/web/app/engine-plant.ts:1-12',
    ],
    excludes: ['torque', 'airflow physics', 'combustion', 'closed-loop plant accuracy'],
  },
  {
    id: 'kw71-byte-source',
    claim:
      'Diagnostic events inject byte values only; framing timing and K-line electrical behavior remain outside the contract.',
    confidence: 'firmware-proof',
    sources: ['ecu/e2e-analysis/subsystems/10-kw71-diagnostics.md:14-35'],
    excludes: ['baud rate', 'K-line voltage', 'wakeup waveform', 'complete command meaning'],
  },
  {
    id: 'logical-output-hooks',
    claim:
      'Hooks observe logical P1, compare, XDATA, fault-memory, and PC activity without assigning connector pins or physical units.',
    confidence: 'firmware-proof',
    sources: [
      'ecu/e2e-analysis/hardware-model.md:65-88',
      'ecu/e2e-analysis/subsystems/09-adaptation-faults-fallbacks.md:23-54',
    ],
    excludes: ['coil current', 'injector flow', 'IAC airflow', 'relay identity'],
  },
  {
    id: 'sensor-extreme-fixtures',
    claim:
      'Zero and FF fault values are selected byte extremes, not recovered open-circuit or short-circuit thresholds.',
    confidence: 'unknown',
    sources: ['ecu/e2e-analysis/subsystems/03-sensor-acquisition.md:43-50'],
    excludes: ['fault code identity', 'qualification delay', 'fallback threshold'],
  },
];
