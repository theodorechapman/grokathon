"use client";

import { useState } from "react";

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "queued"; slug: string }
  | { kind: "error"; message: string };

export function CreateBox() {
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (status.kind === "sending") return;
    setStatus({ kind: "sending" });
    try {
      const res = await fetch("/api/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "something broke");
      setStatus({ kind: "queued", slug: data.slug });
      setPrompt("");
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : "something broke" });
    }
  }

  return (
    <form className="createBox" onSubmit={submit}>
      <input
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Say a game: dodge falling tacos on a rooftop"
        maxLength={300}
        aria-label="Describe the game you want"
      />
      <button type="submit" disabled={status.kind === "sending" || prompt.trim().length < 3}>
        {status.kind === "sending" ? "Queuing…" : "Make it"}
      </button>
      {status.kind === "queued" && (
        <p className="createNote">
          Queued as <strong>{status.slug}</strong>. It lands on the shelf once the
          bot has played it and it passed.
        </p>
      )}
      {status.kind === "error" && <p className="createNote createErr">{status.message}</p>}
    </form>
  );
}
