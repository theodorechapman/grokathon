import type { ScenarioResult, TraceEvent } from './audit-types.ts';

const PRESERVED_KINDS = new Set<TraceEvent['kind']>(['provenance', 'run', 'input', 'access', 'state']);

interface EventSeries {
  key: string;
  count: number;
  first: TraceEvent;
  last: TraceEvent;
}

const seriesKey = (event: TraceEvent): string =>
  [event.kind, event.source, event.name ?? '', event.space ?? '', event.address ?? ''].join(':');

const summarizeRepeated = (events: readonly TraceEvent[]): EventSeries[] => {
  const series = new Map<string, EventSeries>();
  for (const event of events) {
    if (PRESERVED_KINDS.has(event.kind)) continue;
    const key = seriesKey(event);
    const previous = series.get(key);
    series.set(key, previous
      ? { ...previous, count: previous.count + 1, last: event }
      : { key, count: 1, first: event, last: event });
  }
  return [...series.values()].sort((left, right) => left.key.localeCompare(right.key));
};

export const compactScenarioTrace = (scenario: ScenarioResult): Record<string, unknown> => {
  const preservedEvents = scenario.events.filter((event) => PRESERVED_KINDS.has(event.kind));
  const repeatedEventSeries = summarizeRepeated(scenario.events);
  const representedEvents = preservedEvents.length
    + repeatedEventSeries.reduce((sum, series) => sum + series.count, 0);
  if (representedEvents !== scenario.events.length) {
    throw new Error(`${scenario.name}: compact trace lost ${scenario.events.length - representedEvents} events`);
  }
  return {
    name: scenario.name,
    qualification: scenario.qualification,
    totalEvents: scenario.events.length,
    preservedEvents,
    repeatedEventSeries,
    observations: scenario.observations,
  };
};
