"use client";

import { useEffect } from "react";

export function WaitingRoom({ slug, status }: { slug: string; status: string }) {
  useEffect(() => {
    const t = setInterval(() => window.location.reload(), 12_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="waiting">
      <div className="waitingPulse" />
      <h1>Your game is being born</h1>
      <p className="waitingStatus">{status}</p>
      <p className="waitingNote">
        Grok is building <strong>{slug}</strong>. A bot plays it before it ships,
        and nothing ships unverified. This page refreshes itself, when the game
        passes it appears right here.
      </p>
    </div>
  );
}
