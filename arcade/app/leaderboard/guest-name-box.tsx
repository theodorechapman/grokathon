"use client";

import { useEffect, useState } from "react";
import { anonId } from "../g/[slug]/play-beacon";
import { guestDisplayName } from "@/lib/guest-name";

export function GuestNameBox() {
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    setId(anonId());
  }, []);

  if (!id) return null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    try {
      const res = await fetch("/api/guest-name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anon: id, name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "could not save");
      setStatus("saved");
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not save");
      setStatus("error");
    }
  }

  return (
    <form className="guestNameBox" onSubmit={save}>
      <span>
        You&apos;re playing as <strong>{guestDisplayName(id)}</strong>.
      </span>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Pick a name for the board"
        maxLength={16}
        aria-label="Guest display name"
      />
      <button type="submit" disabled={status === "saving" || name.trim().length < 3}>
        {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : "Use it"}
      </button>
      {status === "error" && <span className="endErr">{error}</span>}
    </form>
  );
}
