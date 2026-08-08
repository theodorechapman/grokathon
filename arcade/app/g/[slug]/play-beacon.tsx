"use client";

import { useEffect } from "react";

export function PlayBeacon({ slug, enabled }: { slug: string; enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    fetch("/api/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    }).catch(() => {});
  }, [enabled, slug]);
  return null;
}
