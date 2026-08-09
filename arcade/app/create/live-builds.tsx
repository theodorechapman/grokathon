"use client";

// Builds happening right now, straight from the runner's status stream.
import { useEffect, useState } from "react";
import Link from "next/link";
import type { StageMark } from "../build-terminal";

type LiveBuild = {
  slug: string;
  stage: string;
  detail?: string;
  stages: StageMark[];
  startedAt: number;
};

export function LiveBuilds() {
  const [builds, setBuilds] = useState<LiveBuild[] | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/job-status?active=1", { cache: "no-store" });
        if (res.ok && alive) setBuilds(((await res.json()) as { builds: LiveBuild[] }).builds);
      } catch {}
    };
    load();
    const poll = setInterval(load, 4000);
    return () => {
      alive = false;
      clearInterval(poll);
    };
  }, []);

  if (!builds || builds.length === 0) {
    return (
      <p className="liveIdle">
        Nothing building this second. Post an ask and watch this space light up.
      </p>
    );
  }
  return (
    <ul className="liveBuilds">
      {builds.map((b) => (
        <li key={b.slug}>
          <Link href={`/g/${b.slug}`} className="liveBuildCard">
            <span className="termDot termDotLive" />
            <span className="liveBuildSlug">{b.slug}</span>
            <span className="liveBuildStage">
              {b.stage}
              {b.detail ? ` — ${b.detail}` : ""}
            </span>
            <span className="liveBuildGo">watch →</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
