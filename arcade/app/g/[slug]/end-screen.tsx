"use client";

import { useEffect, useState } from "react";

export type RunEnd = { outcome: "win" | "loss"; score: number; message?: string };
export type Scoring = "time" | "points";

type BoardRow = { handle: string; score: number };
type RankInfo = { rank: number; total: number; top: BoardRow[] };

function fmtScore(score: number, scoring: Scoring): string {
  if (scoring !== "time") return score.toLocaleString();
  const sec = score / 1000;
  const min = Math.floor(sec / 60);
  return min > 0 ? `${min}:${(sec - min * 60).toFixed(1).padStart(4, "0")}` : `${sec.toFixed(1)}s`;
}

export function EndScreen({
  slug,
  end,
  scoring,
  signedIn,
  onReplay,
}: {
  slug: string;
  end: RunEnd;
  scoring: Scoring;
  signedIn: boolean;
  onReplay: () => void;
}) {
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<RankInfo | null>(null);

  // Time games only rank finished runs; points games keep the score either way.
  const claimable = end.outcome === "win" || scoring === "points";

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

  // Signed-in players save automatically, no button.
  useEffect(() => {
    if (signedIn && claimable) void save();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, claimable]);

  // The board is the end screen. Refetch after the save lands so the
  // player's own row shows up in it.
  useEffect(() => {
    let alive = true;
    fetch(`/api/score?slug=${encodeURIComponent(slug)}&score=${end.score}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (alive && data && Array.isArray(data.top)) setInfo(data);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [slug, end.score, saved]);

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
    openLogin(() => {
      if (claimable) void save();
      else window.location.reload();
    });
  }

  return (
    <div className="endScreen">
      <h2>{end.outcome === "win" ? "Cleared!" : "Game over"}</h2>
      {claimable && <p className="endTime">{fmtScore(end.score, scoring)}</p>}
      {claimable && info && !saved && (
        <p className="endRank">
          That run lands at <strong>#{info.rank}</strong>
          {info.total > 0 ? ` of ${info.total + 1}` : ""} on the board.
        </p>
      )}
      {info && info.top.length > 0 && (
        <div className="endBoardWrap">
          <table className={signedIn ? "board endBoard" : "board endBoard endBoardBlur"}>
            <tbody>
              {info.top.map((row, i) => (
                <tr key={row.handle}>
                  <td>{i + 1}</td>
                  <td>@{row.handle}</td>
                  <td>{fmtScore(row.score, scoring)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!signedIn && (
            <button className="endPrimary endBoardGate" onClick={signInAndSave}>
              Sign in with 𝕏 to see the board{claimable ? " and claim your run" : ""}
            </button>
          )}
        </div>
      )}
      {error && <p className="endErr">{error}</p>}
      <button className="endPrimary" onClick={onReplay}>
        {end.outcome === "win" ? "Play again" : "↻ Retry"}
      </button>
    </div>
  );
}
