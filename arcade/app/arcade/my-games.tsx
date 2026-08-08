"use client";

import { useEffect, useState } from "react";
import { myGameSlugs } from "@/lib/my-games";

type Mine = { slug: string; title: string; shipped: boolean };

export function MyGames() {
  const [games, setGames] = useState<Mine[]>([]);

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

    async function load() {
      // server-known games first, then local ones; dedupe, cap 50
      const slugs = [...new Set([...(await serverSlugs()), ...myGameSlugs()])].slice(0, 50);
      if (slugs.length === 0) return;
      const games = await Promise.all(
        slugs.map(async (slug): Promise<Mine> => {
          try {
            const res = await fetch(`/games/${slug}/manifest.json`);
            if (res.ok) {
              const m = await res.json();
              return { slug, title: m.title ?? slug, shipped: true };
            }
          } catch {
            // no manifest yet means the game is still building
          }
          return { slug, title: slug, shipped: false };
        })
      );
      if (!cancelled) setGames(games);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (games.length === 0) return null;

  return (
    <section className="myGames">
      <h2>
        My games
        <a href="/my" className="myGamesAll">
          See all →
        </a>
      </h2>
      <div className="myGamesRow">
        {games.map((g) => (
          <a key={g.slug} href={`/g/${g.slug}`} className="myGameChip">
            {g.shipped ? "▶" : "◌"} {g.title}
            {!g.shipped && <span className="myGameStatus">building</span>}
          </a>
        ))}
      </div>
    </section>
  );
}
