"use client";

// The glass box: a microVM console showing the build as it happens (or as it
// happened). Stage rail on the left, Grok Build's action stream on the right.
import { useEffect, useRef } from "react";
import type { TerminalLine } from "@/lib/build-log";

export type StageMark = { name: string; at: number };

export function BuildTerminal({
  stages,
  currentStage,
  lines,
  live,
}: {
  stages: StageMark[];
  currentStage: string;
  lines: TerminalLine[];
  live: boolean;
}) {
  const screenRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  useEffect(() => {
    const el = screenRef.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  // Deduplicate repeated stage reports (retries re-announce a stage).
  const rail: StageMark[] = [];
  for (const s of stages) {
    if (rail.length === 0 || rail[rail.length - 1].name !== s.name) rail.push(s);
  }

  return (
    <div className="buildTerm">
      <div className="buildTermBar">
        <span className={live ? "termDot termDotLive" : "termDot"} />
        <span className="termTitle">vercel sandbox · grok build · gbdk 4.5</span>
        {live && <span className="termLive">LIVE</span>}
      </div>
      <div className="buildTermBody">
        <ol className="termRail">
          {rail.map((s, i) => {
            const next = rail[i + 1];
            const secs = next ? Math.max(0, Math.round((next.at - s.at) / 1000)) : null;
            const state = !live || next ? "railDone" : s.name === currentStage ? "railNow" : "railDone";
            return (
              <li key={`${s.name}-${s.at}`} className={state}>
                <span className="railName">{s.name}</span>
                {secs !== null && <span className="railTime">{secs}s</span>}
              </li>
            );
          })}
          {rail.length === 0 && <li className="railNow"><span className="railName">queued</span></li>}
        </ol>
        <div
          className="termScreen"
          ref={screenRef}
          onScroll={() => {
            const el = screenRef.current;
            if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
          }}
        >
          {lines.length === 0 && (
            <p className="termSay termWaiting">
              {live ? "waiting for the agent's first move…" : "no agent log for this build"}
            </p>
          )}
          {lines.map((l, i) => (
            <p key={i} className={l.kind === "action" ? "termAction" : "termSay"}>
              {l.text}
            </p>
          ))}
          {live && <span className="termCursor">▮</span>}
        </div>
      </div>
    </div>
  );
}
