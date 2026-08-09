"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GameBoyPlayer } from "./game-boy-player";
import { EndScreen, type RunEnd, type Scoring } from "./end-screen";

export function GameFrame({
  slug,
  title,
  rom,
  scoring = "points",
  signedIn = false,
}: {
  slug: string;
  title: string;
  rom?: string;
  scoring?: Scoring;
  signedIn?: boolean;
}) {
  const playerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [runId, setRunId] = useState(0);
  const [runEnd, setRunEnd] = useState<RunEnd | null>(null);

  const restartGame = useCallback(() => {
    setRunEnd(null);
    if (rom) {
      window.location.reload();
      return;
    }
    setRunId((n) => n + 1);
  }, [rom]);

  const focusGame = useCallback(() => {
    playerRef.current?.focus();
    const frame = frameRef.current;
    if (frame) {
      frame.focus();
      frame.contentWindow?.focus();
    }
  }, []);

  // On phones the header can still nudge the game partly below the fold
  // (in-app browsers, small screens): bring the frame into view on load so
  // the game is the first thing a visitor sees.
  useEffect(() => {
    if (window.innerWidth > 720) return;
    const t = setTimeout(() => {
      playerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
    return () => clearTimeout(t);
  }, []);

  // Every finished run tallies its outcome, signed in or not. Completion
  // rate per game is the signal for what to build next.
  useEffect(() => {
    if (!runEnd) return;
    fetch("/api/outcome", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, outcome: runEnd.outcome }),
    }).catch(() => {});
  }, [runEnd, slug]);

  // Browser games report runs via the contract's nova:score postMessage.
  useEffect(() => {
    if (rom) return;
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      const d = e.data as { type?: string; score?: number; outcome?: string; message?: string };
      if (d?.type !== "nova:score" || typeof d.score !== "number" || !Number.isFinite(d.score)) return;
      setRunEnd({
        outcome: d.outcome === "loss" ? "loss" : "win",
        score: Math.max(0, Math.floor(d.score)),
        message: typeof d.message === "string" ? d.message.slice(0, 120) : undefined,
      });
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [rom]);

  return (
    <>
      <div className="player" ref={playerRef} tabIndex={rom ? 0 : -1} onPointerDown={focusGame}>
        {rom ? (
          <GameBoyPlayer
            key={runId}
            romUrl={`/games/${slug}/${rom}`}
            title={title}
            onRestart={restartGame}
            timeScored={scoring === "time"}
            onRunEnd={setRunEnd}
          />
        ) : (
          <iframe
            key={runId}
            ref={frameRef}
            src={`/games/${slug}/index.html`}
            title={title}
            scrolling="no"
            tabIndex={0}
            onLoad={focusGame}
          />
        )}
        {runEnd ? (
          <EndScreen
            slug={slug}
            end={runEnd}
            scoring={scoring}
            signedIn={signedIn}
            onReplay={restartGame}
          />
        ) : (
          <button
            type="button"
            className="restartFab"
            title="Restart run"
            aria-label="Restart run"
            onClick={restartGame}
          >
            ↻
          </button>
        )}
      </div>
    </>
  );
}
