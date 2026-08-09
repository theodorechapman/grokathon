"use client";

import { useEffect, useState } from "react";
import { toTerminalLines } from "@/lib/build-log";
import { BuildTerminal, type StageMark } from "../../build-terminal";

type Status = {
  stage: string;
  detail?: string;
  stages: StageMark[];
  startedAt: number;
  log?: string[];
};

export function WaitingRoom({ slug, status: initial }: { slug: string; status: string }) {
  const [status, setStatus] = useState<Status>({
    stage: initial || "queued",
    stages: [],
    startedAt: 0,
  });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/job-status?slug=${slug}&log=1`, { cache: "no-store" });
        if (res.ok) {
          const s = (await res.json()) as Status;
          if (s.stage) setStatus(s);
          if (s.stage === "published") window.location.reload();
        }
      } catch {}
    }, 2500);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const refresh = setInterval(() => window.location.reload(), 90_000);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
      clearInterval(refresh);
    };
  }, [slug]);

  const elapsed = status.startedAt > 0 ? Math.floor((now - status.startedAt) / 1000) : null;

  return (
    <div className="waiting waitingWide">
      <h1>Your game is being born</h1>
      <p className="waitingStatus">
        {status.stage}
        {status.detail ? ` — ${status.detail}` : ""}
        {elapsed !== null &&
          ` · ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`}
      </p>
      <BuildTerminal
        stages={status.stages}
        currentStage={status.stage}
        lines={toTerminalLines(status.log ?? [])}
        live
      />
      <p className="waitingNote">
        This is the real build: the Grok Build CLI working inside a Vercel
        Sandbox microVM, rewriting reverse-engineered Game Boy C and compiling
        it with GBDK. This page becomes <strong>{slug}</strong> the moment the
        ROM ships.
      </p>
    </div>
  );
}
