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

  const scrollToRemix = useCallback(() => {
    const box = document.querySelector<HTMLElement>(".remixBox, .remixGate");
    box?.scrollIntoView({ behavior: "smooth", block: "center" });
    box?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
  }, []);

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
            onRemix={scrollToRemix}
          />
        ) : (
          rom && (
            <button
              type="button"
              className="restartFab"
              title="Restart run"
              aria-label="Restart run"
              onClick={restartGame}
            >
              ↻
            </button>
          )
        )}
      </div>
    </>
  );
}
