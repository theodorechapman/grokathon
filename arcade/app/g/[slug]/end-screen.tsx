"use client";

import { useEffect, useState } from "react";

export type RunEnd = { outcome: "win" | "loss"; score: number; message?: string };
export type Scoring = "time" | "points";

function fmtScore(score: number, scoring: Scoring): string {
  if (scoring !== "time") return score.toLocaleString();
  const sec = score / 1000;
  const min = Math.floor(sec / 60);
  return min > 0 ? `${min}:${(sec - min * 60).toFixed(1).padStart(4, "0")}` : `${sec.toFixed(1)}s`;
}

function outcomeLine(end: RunEnd, scoring: Scoring): string | null {
  if (end.message) return end.message;
  if (end.outcome === "loss" && scoring === "time") {
    return "The run only counts when you finish it.";
  }
  return null;
}

export function EndScreen({
  slug,
  end,
  scoring,
  signedIn,
  onReplay,
  onRemix,
}: {
  slug: string;
  end: RunEnd;
  scoring: Scoring;
  signedIn: boolean;
  onReplay: () => void;
  onRemix?: () => void;
}) {
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rank, setRank] = useState<{ rank: number; total: number } | null>(null);

  // Time games only rank finished runs; points games keep the score either way.
  const claimable = end.outcome === "win" || scoring === "points";

  // Signed-in players save automatically. Theo cleared breakout and never
  // appeared on the board because he didn't click the save button.
  useEffect(() => {
    if (signedIn && claimable) void save();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, claimable]);

  useEffect(() => {
    if (!claimable) return;
    let alive = true;
    fetch(`/api/score?slug=${encodeURIComponent(slug)}&score=${end.score}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (alive && data && typeof data.rank === "number") setRank(data);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [claimable, slug, end.score]);
  const line = outcomeLine(end, scoring);

  async function save(): Promise<boolean> {
    try {
      const res = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, score: end.score }),
      });
      if (res.ok) {
        setSaved(true);
        return true;
      }
      if (res.status !== 401) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "could not save");
      }
    } catch {
      setError("could not save");
    }
    return false;
  }

  function openLogin(onClosed?: () => void) {
    const popup = window.open("/api/auth/login", "nova-x-auth", "width=500,height=700");
    if (!popup) {
      window.location.href = "/api/auth/login";
      return;
    }
    const timer = setInterval(() => {
      if (popup.closed) {
        clearInterval(timer);
        onClosed?.();
      }
    }, 500);
  }

  function signInAndSave() {
    openLogin(() => void save());
  }

  function signIn() {
    openLogin(() => window.location.reload());
  }

  return (
    <div className="endScreen">
      <h2>{end.outcome === "win" ? "Cleared!" : "Game over"}</h2>
      {claimable && <p className="endTime">{fmtScore(end.score, scoring)}</p>}
      {line && <p>{line}</p>}
      {claimable && !saved && rank && (
        <p className="endRank">
          That run lands at <strong>#{rank.rank}</strong>
          {rank.total > 0 ? ` of ${rank.total + 1}` : ""} on the board.
        </p>
      )}
      {claimable &&
        (saved ? (
          <p>
            On the board. Better runs overwrite it.{" "}
            <a className="endBoardLink" href={`/leaderboard?g=${slug}`}>
              See the leaderboard →
            </a>
          </p>
        ) : signedIn ? (
          <button className="endPrimary" onClick={() => void save()}>
            Save to leaderboard
          </button>
        ) : (
          <button className="endPrimary" onClick={signInAndSave}>
            Sign in with 𝕏 to claim your spot on the board
          </button>
        ))}
      {!claimable && !signedIn && (
        <button className="endPrimary" onClick={signIn}>
          Sign in with 𝕏 so your next run counts
        </button>
      )}
      {error && <p className="endErr">{error}</p>}
      <button className={claimable || !signedIn ? "endGhost" : "endPrimary"} onClick={onReplay}>
        {end.outcome === "win" ? "Play again" : "↻ Retry"}
      </button>
      {onRemix && (
        <button className="endGhost" onClick={onRemix}>
          Remix this game
        </button>
      )}
    </div>
  );
}
