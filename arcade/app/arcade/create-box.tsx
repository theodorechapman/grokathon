"use client";

import { useState } from "react";
import { rememberMyGame } from "@/lib/my-games";

function openLogin(e: React.MouseEvent) {
  e.preventDefault();
  const popup = window.open("/api/auth/login", "nova-x-auth", "width=500,height=700");
  if (!popup) {
    window.location.href = "/api/auth/login";
    return;
  }
  const timer = setInterval(() => {
    if (popup.closed) {
      clearInterval(timer);
      window.location.reload();
    }
  }, 500);
}

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "queued"; slug: string }
  | { kind: "error"; message: string };

export function CreateBox({ signedIn = false }: { signedIn?: boolean }) {
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
      rememberMyGame(data.slug);
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
          Queued. Watch it get born at <a href={`/g/${status.slug}`}>/g/{status.slug}</a>.
        </p>
      )}
      {status.kind === "error" && <p className="createNote createErr">{status.message}</p>}
      {!signedIn && status.kind === "idle" && (
        <p className="createNote">
          <a href="/api/auth/login" onClick={openLogin}>
            Sign in with 𝕏
          </a>{" "}
          to get credit for what you make.
        </p>
      )}
    </form>
  );
}
