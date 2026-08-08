"use client";

import { useEffect, useState } from "react";

type Banner =
  | { kind: "hidden" }
  | { kind: "claim"; score: number }
  | { kind: "saved"; score: number }
  | { kind: "error"; message: string };

export function ScoreClaim({ slug, signedIn }: { slug: string; signedIn: boolean }) {
  const [banner, setBanner] = useState<Banner>({ kind: "hidden" });

  async function submit(score: number): Promise<boolean> {
    try {
      const res = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, score }),
      });
      if (res.ok) {
        setBanner({ kind: "saved", score });
        return true;
      }
      if (res.status !== 401) {
        const data = await res.json().catch(() => ({}));
        setBanner({ kind: "error", message: data.error ?? "could not save score" });
      }
    } catch {}
    return false;
  }

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      const d = e.data as { type?: string; score?: number };
      if (d?.type !== "nova:score" || typeof d.score !== "number") return;
      const score = Math.floor(d.score);
      if (signedIn) {
        void submit(score);
      } else {
        setBanner({ kind: "claim", score });
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, slug]);

  function claimViaLogin(score: number) {
    const w = 500;
    const h = 700;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top = window.screenY + (window.outerHeight - h) / 2;
    const popup = window.open(
      "/api/auth/login",
      "nova-x-auth",
      `width=${w},height=${h},left=${left},top=${top}`
    );
    if (!popup) {
      window.location.href = "/api/auth/login";
      return;
    }
    const timer = setInterval(async () => {
      if (popup.closed) {
        clearInterval(timer);
        const ok = await submit(score);
        if (ok) setTimeout(() => window.location.reload(), 1200);
      }
    }, 500);
  }

  if (banner.kind === "hidden") return null;

  return (
    <div className="scoreBanner">
      {banner.kind === "claim" && (
        <>
          <span>
            Score <strong>{banner.score.toLocaleString()}</strong>. Nice run.
          </span>
          <button onClick={() => claimViaLogin(banner.score)}>
            Sign in with 𝕏 to claim it
          </button>
          <button className="scoreDismiss" onClick={() => setBanner({ kind: "hidden" })}>
            skip
          </button>
        </>
      )}
      {banner.kind === "saved" && (
        <span>
          Score <strong>{banner.score.toLocaleString()}</strong> saved to the board.
        </span>
      )}
      {banner.kind === "error" && <span>{banner.message}</span>}
    </div>
  );
}
