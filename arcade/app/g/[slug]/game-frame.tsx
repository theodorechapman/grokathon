"use client";

import { useCallback, useRef, useState } from "react";
import { GameBoyPlayer } from "./game-boy-player";
import { EndScreen, type RunEnd } from "./end-screen";

export function GameFrame({
  slug,
  title,
  rom,
  timeScored = false,
  signedIn = false,
}: {
  slug: string;
  title: string;
  rom?: string;
  timeScored?: boolean;
  signedIn?: boolean;
}) {
  const playerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [runId, setRunId] = useState(0);
  const [runEnd, setRunEnd] = useState<RunEnd | null>(null);

  const replay = () => {
    setRunEnd(null);
    setRunId((n) => n + 1);
  };

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
          <>
            <GameBoyPlayer
              key={runId}
              romUrl={`/games/${slug}/${rom}`}
              title={title}
              timeScored={timeScored}
              onRunEnd={setRunEnd}
            />
            {runEnd && (
              <EndScreen slug={slug} end={runEnd} signedIn={signedIn} onReplay={replay} />
            )}
          </>
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
    </>
  );
}
