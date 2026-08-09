import type {
  ObservationReport,
  OracleHook,
  SignalContract,
  TraceEvent,
} from './signal-contract.ts';

const addressMatches = (
  address: number | undefined,
  addresses: number[] | undefined,
  ranges: Array<[number, number]> | undefined,
): boolean => {
  if (address === undefined) return false;
  if (addresses?.includes(address)) return true;
  return ranges?.some(([start, end]) => address >= start && address <= end) ?? false;
};

const matchingEvents = (hook: OracleHook, events: TraceEvent[]): TraceEvent[] => {
  if (hook.source === 'p1') {
    const matches: TraceEvent[] = [];
    let previous: number | undefined;
    for (const event of events) {
      if (event.kind !== 'p1' || event.value === undefined) continue;
      if (previous !== undefined && ((previous ^ event.value) & hook.mask) !== 0) {
        matches.push(event);
      }
      previous = event.value;
    }
    return matches;
  }
  if (hook.source === 'pc') {
    return events.filter(
      (event) => event.kind === 'pc' && addressMatches(event.address, hook.addresses, undefined),
    );
  }
  if (hook.source === 'sfr-write') {
    return events.filter(
      (event) =>
        event.kind === 'sfr-write' && addressMatches(event.address, hook.addresses, undefined),
    );
  }
  const kinds =
    hook.source === 'xdata-write'
      ? new Set<TraceEvent['kind']>(['xdata-write'])
      : new Set<TraceEvent['kind']>(['xdata-read', 'xdata-write']);
  return events.filter(
    (event) =>
      kinds.has(event.kind) && addressMatches(event.address, hook.addresses, hook.ranges),
  );
};

export const observeOutputs = (
  scenario: SignalContract,
  trace: ReadonlyArray<TraceEvent>,
): ObservationReport => {
  for (let index = 1; index < trace.length; index += 1) {
    if (trace[index - 1]!.tick > trace[index]!.tick) {
      throw new Error('trace ticks must be nondecreasing');
    }
  }
  const events = [...trace];
  return {
    scenarioId: scenario.id,
    hooks: scenario.oracleHooks.map((hook) => {
      const matches = matchingEvents(hook, events);
      return {
        id: hook.id,
        role: hook.role,
        count: matches.length,
        firstTick: matches[0]?.tick ?? null,
        lastTick: matches.at(-1)?.tick ?? null,
      };
    }),
  };
};
