type XdataInputEvent = {
  cycle: number;
  kind: 'xdata';
  address: number;
  value: number;
};

type AdcInputEvent = {
  cycle: number;
  kind: 'adc';
  channel: number;
  value: number;
};

type PortInputEvent = {
  cycle: number;
  kind: 'port';
  port: 3 | 5 | 6;
  value: number;
};

type Cc0LineEvent = {
  cycle: number;
  kind: 'cc0';
  state: 0 | 1;
};

type InputEvent =
  | XdataInputEvent
  | AdcInputEvent
  | PortInputEvent
  | Cc0LineEvent;

type P1TransitionEvent = {
  cycle: number;
  kind: 'p1';
  bit: 2 | 3 | 5 | 7;
  state: 0 | 1;
};

type SfrWriteEvent = {
  cycle: number;
  kind: 'sfr-write';
  address: number;
  value: number;
};

type XdataWriteEvent = {
  cycle: number;
  kind: 'xdata-write';
  address: number;
  value: number;
};

type TelemetryEvent =
  | P1TransitionEvent
  | SfrWriteEvent
  | XdataWriteEvent;

type HelloCommand = {
  schema: 'motronic-bridge/v1';
  type: 'hello';
};

type AdvanceCommand = {
  schema: 'motronic-bridge/v1';
  type: 'advance';
  seq: number;
  fromCycle: number;
  toCycle: number;
  events: InputEvent[];
};

type ShutdownCommand = {
  schema: 'motronic-bridge/v1';
  type: 'shutdown';
};

type Command = HelloCommand | AdvanceCommand | ShutdownCommand;

type ReadyResponse = {
  schema: 'motronic-bridge/v1';
  type: 'ready';
  cycle: number;
  nextSeq: number;
  romSha256: string;
  mameCommit: string;
  limits: {
    maxEvents: number;
    maxBatchCycles: number;
  };
};

type FrameResponse = {
  schema: 'motronic-bridge/v1';
  type: 'frame';
  seq: number;
  fromCycle: number;
  toCycle: number;
  cycle: number;
  counters: {
    instructions: number;
    init: number;
    supervisor: number;
    foreground: number;
    timer0: number;
    timer1: number;
    timer2: number;
    capture: number;
    vector0063: number;
    vector006b: number;
    unknownXdataReads: number;
  };
  telemetry: TelemetryEvent[];
};

type ErrorResponse = {
  schema: 'motronic-bridge/v1';
  type: 'error';
  fatal: true;
  message: string;
};

type Response = ReadyResponse | FrameResponse | ErrorResponse;

export interface RuntimeBridgeTypes {
  inputEvent: InputEvent;
  telemetryEvent: TelemetryEvent;
  command: Command;
  response: Response;
  validationContext: {
    expectedSeq?: number;
    expectedFromCycle?: number;
  };
}
