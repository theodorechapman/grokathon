"use client";

import { useEffect, useState } from "react";
import { myGameSlugs } from "@/lib/my-games";

type Row = {
  slug: string;
  title: string;
  live: boolean;
  stage: string | null;
  parent: string | null;
};

export function MyCreations({ titles }: { titles: Record<string, string> }) {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function serverSlugs(): Promise<string[]> {
      try {
        const res = await fetch("/api/my-games", { cache: "no-store" });
        if (!res.ok) throw new Error(`my-games API ${res.status}`);
        const data = (await res.json()) as { slugs?: unknown };
        return Array.isArray(data.slugs)
          ? data.slugs.filter((s): s is string => typeof s === "string")
          : [];
      } catch (err) {
        console.error("my-games fetch failed, falling back to localStorage", err);
        return [];
      }
    }

    async function loadRow(slug: string): Promise<Row> {
      try {
        const res = await fetch(`/games/${slug}/manifest.json`);
        if (res.ok) {
          const m = (await res.json()) as { title?: string; parent?: string | null };
          return {
            slug,
            title: m.title ?? slug,
            live: true,
            stage: null,
            parent: m.parent ?? null,
          };
        }
      } catch {
        // no manifest yet means the game is still building
      }
      let stage: string | null = null;
      try {
        const res = await fetch(`/api/job-status?slug=${slug}`, { cache: "no-store" });
        if (res.ok) {
          const s = (await res.json()) as { stage?: string };
          stage = s.stage || null;
        }
      } catch {
        // status service down; row still shows as building
      }
      return { slug, title: slug, live: false, stage, parent: null };
    }

    async function load() {
      // server-known games first, then local ones; dedupe, cap 50
      const slugs = [...new Set([...(await serverSlugs()), ...myGameSlugs()])].slice(0, 50);
      const rows = await Promise.all(slugs.map(loadRow));
      if (!cancelled) setRows(rows);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (rows === null) return <p className="empty">Loading your creations…</p>;
  if (rows.length === 0) {
    return (
      <p className="empty">
        Nothing here yet. <a href="/create">Create a game</a> or remix one from
        the <a href="/arcade">arcade</a> and it&apos;ll show up here.
      </p>
    );
  }

  return (
    <table className="board myCreations">
      <thead>
        <tr>
          <th>Game</th>
          <th>Status</th>
          <th>Remix of</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.slug}>
            <td>
              <a href={`/g/${r.slug}`} className="myCreationTitle">
                {r.live ? "▶" : "◌"} {r.title}
              </a>
            </td>
            <td>
              {r.live ? (
                <span className="statusChip statusLive">live</span>
              ) : (
                <span className="statusChip statusBuilding">
                  building{r.stage ? ` — ${r.stage}` : ""}
                </span>
              )}
            </td>
            <td>
              {r.parent ? (
                <a href={`/g/${r.parent}`} className="myCreationParent">
                  ↳ {titles[r.parent] ?? r.parent}
                </a>
              ) : (
                <span className="myCreationParent">—</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
