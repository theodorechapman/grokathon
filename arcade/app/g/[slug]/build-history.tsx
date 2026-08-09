"use client";

// How this game got made: stage timeline + the agent's action stream, replayed
// from the bundle's build.json and build-log.ndjson (both static files).
import { useEffect, useState } from "react";
import { parseGrokStream, type BuildRecord, type TerminalLine } from "@/lib/build-log";
import { BuildTerminal, type StageMark } from "../../build-terminal";

export function BuildHistory({ slug }: { slug: string }) {
  const [record, setRecord] = useState<BuildRecord | null>(null);
  const [lines, setLines] = useState<TerminalLine[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch(`/games/${slug}/build.json`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setRecord)
      .catch(() => setRecord(null));
  }, [slug]);

  useEffect(() => {
    if (!open || lines !== null) return;
    fetch(`/games/${slug}/build-log.ndjson`)
      .then((res) => (res.ok ? res.text() : ""))
      .then((text) => setLines(parseGrokStream(text)))
      .catch(() => setLines([]));
  }, [open, lines, slug]);

  if (!record) return null;

  const stages: StageMark[] = record.stages.map((s) => ({ name: s.stage, at: Date.parse(s.at) }));
  const first = stages[0]?.at;
  const total = first ? Math.round((Date.parse(record.finishedAt) - first) / 1000) : null;

  return (
    <div className="buildHistory">
      <p className="buildMeta">
        {record.audit ? (
          <>Shipped before build logs existed, then re-verified by the Grok Build CLI in a Vercel Sandbox microVM: recompile, ROM compare, contract check.</>
        ) : record.engine === "sandbox" ? (
          <>Built by the Grok Build CLI in a Vercel Sandbox microVM{total !== null && <> in {total}s</>}.</>
        ) : (
          <>Built by Grok on the Nova pipeline{total !== null && <> in {total}s</>}.</>
        )}
        {record.job.prompt && (
          <>
            {" "}
            The ask: <em>&ldquo;{record.job.prompt}&rdquo;</em>
            {record.job.creator ? ` — @${record.job.creator}` : ""}
          </>
        )}
        {record.job.tweet && (
          <>
            {" "}
            <a href={`https://x.com/i/web/status/${record.job.tweet}`}>𝕏 the original ask</a>
          </>
        )}
      </p>
      <button className="buildReplayBtn" onClick={() => setOpen(!open)}>
        {open ? "Hide the build log" : "Watch how it was built"}
      </button>
      {open && (
        <BuildTerminal
          stages={stages}
          currentStage=""
          lines={lines ?? [{ kind: "say", text: "loading the agent log…" }]}
          live={false}
        />
      )}
    </div>
  );
}
