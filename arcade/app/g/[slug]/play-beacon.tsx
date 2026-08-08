"use client";

import { useEffect } from "react";

export function PlayBeacon({ slug }: { slug: string }) {
  useEffect(() => {
    fetch("/api/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    }).catch(() => {});
  }, [slug]);
  return null;
}
