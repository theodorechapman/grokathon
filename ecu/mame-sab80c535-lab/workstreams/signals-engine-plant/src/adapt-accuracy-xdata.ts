import type {
  AccuracyXdataPlan,
  AdapterEvent,
  SignalContract,
  StimulusFrame,
} from './signal-contract.ts';

const byteHex = (value: number): string => value.toString(16).padStart(2, '0');

const frameEvents = (frame: StimulusFrame, previous?: StimulusFrame): AdapterEvent[] => {
  const events: AdapterEvent[] = [];
  const board = [
    [0xa040, frame.boardStatus.a040, previous?.boardStatus.a040],
    [0xa041, frame.boardStatus.a041, previous?.boardStatus.a041],
    [0xa081, frame.boardStatus.a081, previous?.boardStatus.a081],
  ] as const;
  for (const [address, value, oldValue] of board) {
    if (value !== oldValue) events.push({ tick: frame.tick, kind: 'xdata-input', address, value });
  }
  frame.adc.forEach((value, channel) => {
    if (value !== previous?.adc[channel]) {
      events.push({ tick: frame.tick, kind: 'adc-input', channel, value });
    }
  });
  const ports = [
    [3, frame.digitalPorts.p3, previous?.digitalPorts.p3],
    [5, frame.digitalPorts.p5, previous?.digitalPorts.p5],
    [6, frame.digitalPorts.p6, previous?.digitalPorts.p6],
  ] as const;
  for (const [port, value, oldValue] of ports) {
    if (value !== oldValue) events.push({ tick: frame.tick, kind: 'port-input', port, value });
  }
  return events;
};

const eventOrder: Record<AdapterEvent['kind'], number> = {
  'xdata-input': 0,
  'adc-input': 1,
  'port-input': 2,
  'cc0-edge': 3,
  'uart-byte': 4,
};

export const adaptAccuracyXdata = (scenario: SignalContract): AccuracyXdataPlan => {
  const first = scenario.frames[0];
  if (!first) throw new Error(`${scenario.id}: cannot adapt an empty frame list`);
  const events: AdapterEvent[] = [];
  scenario.frames.forEach((frame, index) => {
    events.push(...frameEvents(frame, scenario.frames[index - 1]));
  });
  events.push(
    ...scenario.crankEdges.map(
      (edge): AdapterEvent => ({ tick: edge.tick, kind: 'cc0-edge', edge: edge.edge }),
    ),
    ...scenario.diagnosticBytes.map(
      (event): AdapterEvent => ({ tick: event.tick, kind: 'uart-byte', value: event.value }),
    ),
  );
  events.sort(
    (left, right) => left.tick - right.tick || eventOrder[left.kind] - eventOrder[right.kind],
  );
  return {
    schema: 'accuracy-xdata-signal-plan/v1',
    scenarioId: scenario.id,
    seed: scenario.seed,
    ticksPerSecond: scenario.timebase.ticksPerSecond,
    initialEnvironment: {
      MOTRONIC_XRAM_RESET: 'zero',
      MOTRONIC_UNKNOWN_POLICY: 'stop',
      MOTRONIC_INPUTS: [
        `a040=${byteHex(first.boardStatus.a040)}`,
        `a041=${byteHex(first.boardStatus.a041)}`,
        `a081=${byteHex(first.boardStatus.a081)}`,
      ].join(','),
    },
    events,
    oracleHooks: scenario.oracleHooks.map((hook) => ({ ...hook })),
    constraints: [
      'The unpatched accuracy-xdata target accepts only static MOTRONIC_INPUTS.',
      'The MCU core has no external-3 pin-edge API; CC0 events require core integration.',
      'ADC callbacks, dynamic P3/P5/P6 reads, and UART RX delivery require driver callbacks.',
      'Convert bench ticks to MAME attotime with one exact rational timebase.',
      'Do not return A040/A041 output latches from input reads.',
    ],
  };
};
