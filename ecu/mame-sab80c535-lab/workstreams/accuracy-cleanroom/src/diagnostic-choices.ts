import type { ProvenanceItem } from './audit-types.ts';

const choice = (
  id: string,
  name: string,
  value: unknown,
  file: string,
  line: number,
  needle: string,
  impact: ProvenanceItem['impact'] = 'diagnostics',
  defect?: string,
): ProvenanceItem => ({
  id: `choice.${id}`,
  name,
  value,
  provenance: 'arbitrary-model',
  impact,
  subsystem: 'diagnostics',
  source: { file: `cleanroom/src/${file}`, line, needle },
  sensitivity: 'unmeasured',
  defect,
});

const resolved = (item: ProvenanceItem): ProvenanceItem => ({ ...item, defectStatus: 'resolved' });

export const DIAGNOSTIC_CHOICES: readonly ProvenanceItem[] = [
  choice('service-codes', 'diagnostic service byte assignments', { identity: 0, readMemory: 1, readCode: 2, programming: 3, faultPage: 4, runtimeData: 5, fixedBlock: 6, clearFaults: 7, actuatorTest: 8, stopActuator: 9 }, 'diagnostics/kw71-services.ts', 24, 'export const SERVICE'),
  choice('identity-placeholders', 'unrecovered identity block payloads', '[index,0,0,0,0]', 'diagnostics/kw71-services.ts', 79, 'return { service, payload: [index'),
  choice('memory-request-layout', 'memory-read request layout', '[addressHi,addressLo,length]', 'diagnostics/kw71-services.ts', 83, 'const address'),
  resolved(choice('memory-space-routing', 'low-page >=0x80 is SFR, otherwise XRAM', true, 'diagnostics/kw71-services.ts', 89, 'address < 0x0100', undefined, 'Multi-byte SFR reads previously repeated the first address instead of adding i.')),
  choice('code-request-layout', 'code-read request layout', '[addressHi,addressLo,length]', 'diagnostics/kw71-services.ts', 97, 'const address'),
  choice('fault-page-size', 'fault records per diagnostic page', 3, 'diagnostics/kw71-services.ts', 111, 'perPage = 3'),
  choice('fault-page-fields', 'diagnostic fault page omits age byte', ['identifier', 'status', 'snapshotA', 'snapshotB'], 'diagnostics/kw71-services.ts', 115, 'record.identifier'),
  choice('runtime-index-order', 'runtime data index follows JavaScript summary key order modulo count', true, 'diagnostics/kw71-services.ts', 123, 'Object.keys'),
  choice('fixed-block', 'secondary fixed block bytes', [1, 2, 3, 4], 'diagnostics/kw71-services.ts', 131, '0x01, 0x02'),
  choice('phase-encoding', 'diagnostic phase numeric encoding', { sync: 0, keyword: 1, ready: 2, length: 3, body: 4, complete: 5 }, 'diagnostics/kw71-session.ts', 33, 'export const PHASE'),
  choice('diagnostic-timeout', 'diagnostic timeout in foreground passes', 50, 'diagnostics/kw71-session.ts', 49, 'TIMEOUT_RELOAD'),
  choice('keyword-fallback', 'every non-0x06 startup byte is treated as keyword and complemented', true, 'diagnostics/kw71-session.ts', 150, 'Otherwise this is a keyword'),
  choice('echo-state', 'echo validation latch remains false', false, 'diagnostics/kw71-session.ts', 54, 'awaitingEcho = false', undefined, 'No code sets awaitingEcho=true, so the claimed complement-echo rejection path is unreachable.'),
  choice('terminator-filter', 'all 0x03 bytes are removed from received payload', true, 'diagnostics/kw71-session.ts', 196, 'filter((b)'),
  choice('serial-mode-default', 'unknown SCON selector bit defaults false', false, 'diagnostics/kw71-uart.ts', 22, 'modeBit = false'),
  choice('serial-timeout-restart', 'serial timeout full restart is opt-in and defaults false', false, 'diagnostics/kw71-uart.ts', 25, 'reinitialiseOnTimeout'),
  choice('actuator-pair-03', 'actuator request 0x03 pairing', 'CC3/P1.3', 'diagnostics/kw71-actuators.ts', 34, 'code: 0x03', 'actuator-wiring'),
  choice('actuator-pair-20', 'actuator request 0x20 pairing', 'CC2/P1.2', 'diagnostics/kw71-actuators.ts', 39, 'code: 0x20', 'actuator-wiring'),
  choice('actuator-pair-1d', 'actuator request 0x1d pairing', 'routine 0x6db6', 'diagnostics/kw71-actuators.ts', 43, 'code: 0x1d', 'actuator-wiring'),
  choice('actuator-pair-24', 'actuator request 0x24 pairing', 'XRAM 0x0046 bit 0', 'diagnostics/kw71-actuators.ts', 44, 'code: 0x24', 'actuator-wiring'),
  choice('actuator-pair-25', 'actuator request 0x25 pairing', 'XRAM 0x0049 bit 0', 'diagnostics/kw71-actuators.ts', 45, 'code: 0x25', 'actuator-wiring'),
  choice('actuator-pair-30', 'actuator request 0x30 pairing', 'internal actuator-flag', 'diagnostics/kw71-actuators.ts', 46, 'code: 0x30', 'actuator-wiring'),
  choice('actuator-drive-mode', 'periodic actuator service toggles targets once per pass', true, 'diagnostics/kw71-actuators.ts', 81, 'servicePeriodic'),
];
