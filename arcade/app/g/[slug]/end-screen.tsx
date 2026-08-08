"use client";

import { useState } from "react";

export type RunEnd = { outcome: "win" | "loss"; elapsedMs: number };

function fmtTime(ms: number): string {
  const sec = ms / 1000;
  const min = Math.floor(sec / 60);
  return min > 0 ? `${min}:${(sec - min * 60).toFixed(1).padStart(4, "0")}` : `${sec.toFixed(1)}s`;
}

export function EndScreen({
  slug,
  end,
  signedIn,
  onReplay,
}: {
  slug: string;
  end: RunEnd;
  signedIn: boolean;
  onReplay: () => void;
}) {
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(): Promise<boolean> {
    try {
      const res = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, score: end.elapsedMs }),
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
      {end.outcome === "loss" ? (
        <>
          <h2>Game over</h2>
          <p>The ball got past you. Runs only count when you clear the board.</p>
          <button className="endPrimary" onClick={onReplay}>
            ↻ Retry
          </button>
        </>
      ) : (
        <>
          <h2>Cleared!</h2>
          <p className="endTime">{fmtTime(end.elapsedMs)}</p>
          {saved ? (
            <p>On the board. Faster runs overwrite it.</p>
          ) : signedIn ? (
            <button className="endPrimary" onClick={() => void save()}>
              Save to leaderboard
            </button>
          ) : (
            <button className="endPrimary" onClick={signInAndSave}>
              Sign in with 𝕏 to save your time
            </button>
          )}
          {error && <p className="endErr">{error}</p>}
          <button className="endGhost" onClick={onReplay}>
            Play again
          </button>
        </>
      )}
    </div>
  );
}
