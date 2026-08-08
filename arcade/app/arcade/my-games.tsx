"use client";

import { useEffect, useState } from "react";
import { myGameSlugs } from "@/lib/my-games";

type Mine = { slug: string; title: string; shipped: boolean };

export function MyGames() {
  const [games, setGames] = useState<Mine[]>([]);

  useEffect(() => {
    const slugs = myGameSlugs();
    if (slugs.length === 0) return;
    Promise.all(
      slugs.map(async (slug): Promise<Mine> => {
        try {
          const res = await fetch(`/games/${slug}/manifest.json`);
          if (res.ok) {
            const m = await res.json();
            return { slug, title: m.title ?? slug, shipped: true };
          }
        } catch {}
        return { slug, title: slug, shipped: false };
      })
    ).then(setGames);
  }, []);

  if (games.length === 0) return null;

  return (
    <section className="myGames">
      <h2>My games</h2>
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
