"use client";

import { useEffect, useState } from "react";

type Status = {
  stage: string;
  detail?: string;
  stages: { name: string; at: number }[];
  startedAt: number;
};

const KNOWN_STAGES = ["queued", "patching source", "compiling", "verifying", "publishing"];

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
        const res = await fetch(`/api/job-status?slug=${slug}`, { cache: "no-store" });
        if (res.ok) {
          const s = (await res.json()) as Status;
          if (s.stage) setStatus(s);
          if (s.stage === "published") window.location.reload();
        }
      } catch {}
    }, 3000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const refresh = setInterval(() => window.location.reload(), 60_000);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
      clearInterval(refresh);
    };
  }, [slug]);

  const reached = new Set(status.stages.map((s) => s.name));
  const elapsed = status.startedAt > 0 ? Math.floor((now - status.startedAt) / 1000) : null;

  return (
    <div className="waiting">
      <div className="waitingPulse" />
      <h1>Your game is being born</h1>
      {elapsed !== null && (
        <p className="waitingClock">
          {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
        </p>
      )}
      <ol className="buildStages">
        {KNOWN_STAGES.map((name) => (
          <li
            key={name}
            className={
              status.stage === name
                ? "stageNow"
                : reached.has(name)
                  ? "stageDone"
                  : "stagePending"
            }
          >
            {reached.has(name) && status.stage !== name ? "✓" : status.stage === name ? "●" : "○"}{" "}
            {name}
            {status.stage === name && status.detail ? ` — ${status.detail}` : ""}
          </li>
        ))}
      </ol>
      <p className="waitingNote">
        Grok is rebuilding <strong>{slug}</strong> from real reverse-engineered
        source. A bot plays it before it ships, and this page becomes the game
        the moment it passes.
      </p>
    </div>
  );
}
