"use client";

import { useEffect } from "react";

const ANON_KEY = "nova:anon";

export function anonId(): string {
  try {
    let id = localStorage.getItem(ANON_KEY);
    if (!id) {
      id = Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      localStorage.setItem(ANON_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

export function PlayBeacon({ slug, enabled }: { slug: string; enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    fetch("/api/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, anon: anonId() }),
    }).catch(() => {});
  }, [enabled, slug]);
  return null;
}
