"use client";

import { useState } from "react";

export function VoteButton({ slug, votes }: { slug: string; votes: number }) {
  const [count, setCount] = useState(votes);
  const [voted, setVoted] = useState(false);

  async function vote() {
    if (voted) return;
    setVoted(true);
    try {
      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json();
      if (res.ok) setCount(data.votes);
    } catch {
      setVoted(false);
    }
  }

  return (
    <button className={voted ? "voteBtn voteBtnDone" : "voteBtn"} onClick={vote} aria-label="Upvote">
      ▲ {count}
    </button>
  );
}
