"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";

export function GameFrame({ slug, title }: { slug: string; title: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [runId, setRunId] = useState(0);

  const focusGame = useCallback(() => {
    const frame = frameRef.current;
    if (!frame) return;
    frame.focus();
    frame.contentWindow?.focus();
  }, []);

  return (
    <>
      <div className="player" onPointerDown={focusGame}>
        <iframe
          key={runId}
          ref={frameRef}
          src={`/games/${slug}/index.html`}
          title={title}
          scrolling="no"
          tabIndex={0}
          onLoad={focusGame}
        />
      </div>
      <div className="frameBar">
        <button
          className="frameBtn"
          onClick={() => {
            setRunId((n) => n + 1);
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
