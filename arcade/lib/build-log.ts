// Types + parsing for game build provenance: the bundle's build.json and the
// raw Grok Build CLI stream in build-log.ndjson. Mirrors the runner's
// humanize_grok_event so live view and replay read the same way.

export type BuildStage = { at: string; stage: string; detail: string };

export type BuildRecord = {
  engine: "sandbox" | "local";
  job: { prompt?: string; source?: string; parent?: string; creator?: string; tweet?: string };
  stages: BuildStage[];
  finishedAt: string;
};

export type TerminalLine = { kind: "action" | "say"; text: string };

type GrokEvent = {
  type?: string;
  data?: string;
  toolName?: string;
  rawInput?: Record<string, unknown>;
};

/** Collapse the raw ACP ndjson stream into terminal lines: grok's narration
 * plus one "▸ tool file" line per action. */
export function parseGrokStream(ndjson: string): TerminalLine[] {
  const lines: TerminalLine[] = [];
  let buf = "";
  const flush = () => {
    const text = buf.trim();
    buf = "";
    if (text) lines.push({ kind: "say", text });
  };
  for (const raw of ndjson.split("\n")) {
    if (!raw.trim()) continue;
    let ev: GrokEvent;
    try {
      ev = JSON.parse(raw) as GrokEvent;
    } catch {
      continue;
    }
    if (ev.type === "text") {
      buf += ev.data ?? "";
      if (buf.length > 240) flush();
    } else if (ev.type === "tool_call") {
      flush();
      const arg = Object.values(ev.rawInput ?? {}).find(
        (v): v is string => typeof v === "string" && v.length > 0,
      );
      lines.push({ kind: "action", text: `▸ ${ev.toolName ?? "tool"} ${(arg ?? "").slice(0, 120)}`.trimEnd() });
    } else if (ev.type === "end") {
      flush();
    }
  }
  flush();
  return lines;
}

/** Live log lines from /api/job-status arrive pre-humanized by the runner. */
export function toTerminalLines(log: string[]): TerminalLine[] {
  return log.map((text) => ({ kind: text.startsWith("▸") ? "action" : "say", text }));
}
