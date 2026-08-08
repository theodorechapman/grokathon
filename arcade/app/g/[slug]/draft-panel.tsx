"use client";

import { useState } from "react";

type IterateStatus =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "queued" }
  | { kind: "error"; message: string };

type PublishStatus =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "done" }
  | { kind: "error"; message: string };

/** Creator-only controls on a draft: iterate in place or publish it. */
export function DraftPanel({ slug }: { slug: string }) {
  const [prompt, setPrompt] = useState("");
  const [iterate, setIterate] = useState<IterateStatus>({ kind: "idle" });
  const [publish, setPublish] = useState<PublishStatus>({ kind: "idle" });

  async function submitIteration(e: React.FormEvent) {
    e.preventDefault();
    if (iterate.kind === "sending") return;
    setIterate({ kind: "sending" });
    try {
      const res = await fetch("/api/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, target: slug }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "something broke");
      setIterate({ kind: "queued" });
      setPrompt("");
    } catch (err) {
      setIterate({
        kind: "error",
        message: err instanceof Error ? err.message : "something broke",
      });
    }
  }

  async function submitPublish() {
    if (publish.kind === "sending") return;
    setPublish({ kind: "sending" });
    try {
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "something broke");
      setPublish({ kind: "done" });
    } catch (err) {
      setPublish({
        kind: "error",
        message: err instanceof Error ? err.message : "something broke",
      });
    }
  }

  return (
    <section className="remixPanel draftControls">
      <h2>This is your draft</h2>
      <p>
        Only you can see it. Keep iterating until it feels right, then publish
        it to the shelf. Published games are frozen — further changes become
        remixes.
      </p>
      <form className="createBox remixBox" onSubmit={submitIteration}>
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Keep going: describe the next change"
          maxLength={300}
          aria-label="Describe the next change to this draft"
        />
        <button
          type="submit"
          disabled={iterate.kind === "sending" || prompt.trim().length < 3}
        >
          {iterate.kind === "sending" ? "Queuing…" : "Iterate"}
        </button>
      </form>
      {iterate.kind === "queued" && (
        <p className="createNote">
          Iteration queued. The draft rebuilds in place — refresh in about 90
          seconds.
        </p>
      )}
      {iterate.kind === "error" && <p className="createNote createErr">{iterate.message}</p>}
      <div className="draftPublishRow">
        <button
          type="button"
          className="publishBtn"
          onClick={submitPublish}
          disabled={publish.kind === "sending" || publish.kind === "done"}
        >
          {publish.kind === "sending"
            ? "Publishing…"
            : publish.kind === "done"
              ? "Published ✓"
              : "Publish to the shelf"}
        </button>
        {publish.kind === "done" && (
          <p className="createNote">
            Published. It&apos;ll show on the shelf when the site redeploys, a
            minute or two.
          </p>
        )}
        {publish.kind === "error" && (
          <p className="createNote createErr">{publish.message}</p>
        )}
      </div>
    </section>
  );
}
