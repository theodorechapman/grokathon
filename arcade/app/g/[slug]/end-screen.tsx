"use client";

import { useState } from "react";

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

  // Time games only rank finished runs; points games keep the score either way.
  const claimable = end.outcome === "win" || scoring === "points";
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

  function signInAndSave() {
    const popup = window.open("/api/auth/login", "nova-x-auth", "width=500,height=700");
    if (!popup) {
      window.location.href = "/api/auth/login";
      return;
    }
    const timer = setInterval(async () => {
      if (popup.closed) {
        clearInterval(timer);
        await save();
      }
    }, 500);
  }

  return (
    <div className="endScreen">
      <h2>{end.outcome === "win" ? "Cleared!" : "Game over"}</h2>
      {claimable && <p className="endTime">{fmtScore(end.score, scoring)}</p>}
      {line && <p>{line}</p>}
      {claimable &&
        (saved ? (
          <p>On the board. Better runs overwrite it.</p>
        ) : signedIn ? (
          <button className="endPrimary" onClick={() => void save()}>
            Save to leaderboard
          </button>
        ) : (
          <button className="endPrimary" onClick={signInAndSave}>
            Sign in with 𝕏 to save your {scoring === "time" ? "time" : "score"}
          </button>
        ))}
      {error && <p className="endErr">{error}</p>}
      <button className={claimable ? "endGhost" : "endPrimary"} onClick={onReplay}>
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
