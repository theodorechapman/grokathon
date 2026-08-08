"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { GameBoyPlayer } from "./game-boy-player";

export function GameFrame({
  slug,
  title,
  rom,
  timeScored = false,
}: {
  slug: string;
  title: string;
  rom?: string;
  timeScored?: boolean;
}) {
  const playerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [runId, setRunId] = useState(0);

  const focusGame = useCallback(() => {
    playerRef.current?.focus();
    const frame = frameRef.current;
    if (frame) {
      frame.focus();
      frame.contentWindow?.focus();
    }
  }, []);

  return (
    <>
      <div className="player" ref={playerRef} tabIndex={rom ? 0 : -1} onPointerDown={focusGame}>
        {rom ? (
          <GameBoyPlayer
            key={runId}
            romUrl={`/games/${slug}/${rom}`}
            title={title}
            timeScored={timeScored}
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
      </div>
      <div className="frameBar">
        <button
          className="frameBtn"
          onClick={() => {
            if (rom) {
              window.location.reload();
            } else {
              setRunId((n) => n + 1);
            }
          }}
        >
          ↻ Replay
        </button>
        <Link href={`/leaderboard?g=${slug}`} className="frameBtn frameLink">
          View leaderboard →
        </Link>
      </div>
    </>
  );
}
