import Link from "next/link";
import { listGames, type GameManifest } from "@/lib/games";
import { rankScore, statsFor } from "@/lib/stats";
import { SiteNav } from "../site-nav";
import { MyGames } from "./my-games";
import { VoteButton } from "./vote-button";

export const dynamic = "force-dynamic";

const FILTERS: Record<string, { label: string; match: (g: GameManifest) => boolean }> = {
  all: { label: "All", match: () => true },
  "1p": { label: "1 player", match: (g) => (g.players ?? 1) === 1 },
  "2p": { label: "2 players", match: (g) => g.players === 2 },
};

export default async function ArcadePage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>;
}) {
  const { f } = await searchParams;
  const filter = FILTERS[f ?? "all"] ?? FILTERS.all;
  const unranked = await listGames();
  const stats = await statsFor(unranked.map((g) => g.slug));
  const ranked = unranked
    .filter(filter.match)
    .sort((a, b) => {
      const diff = rankScore(stats.get(b.slug)!) - rankScore(stats.get(a.slug)!);
      return diff !== 0 ? diff : b.createdAt.localeCompare(a.createdAt);
    });
  const bySlug = new Map(ranked.map((g) => [g.slug, g]));
  const titleOf = (slug: string | null) => (slug && bySlug.get(slug)?.title) || null;
  const roots = ranked.filter((g) => !g.parent || !bySlug.has(g.parent));
  const games = roots.flatMap((root) => [
    root,
    ...ranked.filter((g) => g.parent === root.slug && g.slug !== root.slug),
  ]);
  const topSlug =
    ranked.length > 0 && rankScore(stats.get(ranked[0].slug)!) > 0 ? ranked[0].slug : null;
  const isNew = (g: (typeof games)[number]) =>
    Date.now() - new Date(g.createdAt).getTime() < 2 * 60 * 60 * 1000;
  return (
    <main>
      <SiteNav active="arcade" />

      <header className="masthead" style={{ marginTop: 8 }}>
        <h1>The arcade</h1>
      </header>

      <MyGames />

      <div className="shelfHead">
        <div className="filterRow">
          {Object.entries(FILTERS).map(([key, def]) => (
            <Link
              key={key}
              href={key === "all" ? "/arcade" : `/arcade?f=${key}`}
              className={
                (f ?? "all") === key ? "filterChip filterChipActive" : "filterChip"
              }
            >
              {def.label}
            </Link>
          ))}
        </div>
      </div>

      {games.length === 0 ? (
        <p className="empty">
          {unranked.length === 0
            ? "No games on the shelf yet. The first one lands when the pipeline ships its first verified bundle."
            : "Nothing matches this filter yet. Say a game and change that."}
        </p>
      ) : (
        <div className="grid">
          {games.map((game) => (
            <article key={game.slug} className="gameCard">
              <Link href={`/g/${game.slug}`} className="gameCover">
                {game.hasCover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/games/${game.slug}/cover.png`} alt="" />
                ) : (
                  <span className="gameCoverFallback">{game.title.charAt(0)}</span>
                )}
              </Link>
              <div className="gameBody">
                {game.parent && bySlug.has(game.parent) && (
                  <p className="remixOf">↳ remix of {titleOf(game.parent)}</p>
                )}
                <div className="gameTitleRow">
                  <h3>
                    {game.title}
                    {game.slug === topSlug && <span className="badgeFav"> ★ community favorite</span>}
                    {game.slug !== topSlug && isNew(game) && <span className="badgeNew"> NEW</span>}
                  </h3>
                  <span className="tag">{game.creator ? `@${game.creator}` : "Nova"}</span>
                </div>
                <p>{game.description}</p>
                <div className="gameActions">
                  <Link href={`/g/${game.slug}`} className="playBtn">
                    ▶&nbsp; Play
                  </Link>
                  <VoteButton slug={game.slug} votes={stats.get(game.slug)!.votes} />
                  <span className="gameControls">
                    {stats.get(game.slug)!.plays} plays
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
