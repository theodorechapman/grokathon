"use client";

// Fullscreen overlay for reviewing a shipped game's build log: fetches the
// bundle's build.json + build-log.ndjson and fills the screen with the
// terminal. Esc, the close button, or the backdrop dismisses it.
import { useEffect, useState } from "react";
import { parseGrokStream, type BuildRecord, type TerminalLine } from "@/lib/build-log";
import { BuildTerminal } from "./build-terminal";

export function BuildLogModal({
  slug,
  title,
  onClose,
}: {
  slug: string;
  title: string;
  onClose: () => void;
}) {
  const [record, setRecord] = useState<BuildRecord | null>(null);
  const [lines, setLines] = useState<TerminalLine[] | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/games/${slug}/build.json`)
        .then((res) => (res.ok ? (res.json() as Promise<BuildRecord>) : null))
        .catch(() => null),
      fetch(`/games/${slug}/build-log.ndjson`)
        .then((res) => (res.ok ? res.text() : ""))
        .catch(() => ""),
    ]).then(([rec, text]) => {
      setRecord(rec);
      setLines(parseGrokStream(text));
    });
  }, [slug]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="buildModalOverlay" onClick={onClose}>
      <div className="buildModal" onClick={(e) => e.stopPropagation()}>
        <div className="buildModalHead">
          <div>
            <h3>{title}</h3>
            <p className="cardByline">
              {record?.audit
                ? "Shipped before build logs existed. Grok Build re-verified the shipped source in a sandbox: recompile, ROM compare, contract check."
                : "The Grok Build CLI's own action stream from this game's sandbox build."}
              {record?.job?.prompt && <> The ask: &ldquo;{record.job.prompt}&rdquo;</>}
            </p>
          </div>
          <button className="buildModalClose" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <BuildTerminal
          stages={(record?.stages ?? []).map((s) => ({ name: s.stage, at: Date.parse(s.at) }))}
          currentStage=""
          lines={lines ?? [{ kind: "say", text: "loading the agent log…" }]}
          live={false}
        />
      </div>
    </div>
  );
}
