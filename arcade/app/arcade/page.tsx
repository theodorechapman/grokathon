import Link from "next/link";
import { listGames, type GameManifest } from "@/lib/games";
import { rankScore, statsFor, type GameStats } from "@/lib/stats";
import { SiteNav } from "../site-nav";
import { MyGames } from "./my-games";
import { VoteButton } from "./vote-button";

export const dynamic = "force-dynamic";

const FILTERS: Record<string, { label: string; match: (g: GameManifest) => boolean }> = {
  all: { label: "All", match: () => true },
  "1p": { label: "1 player", match: (g) => (g.players ?? 1) === 1 },
  "2p": { label: "2 players", match: (g) => g.players === 2 },
};

const SORTS = { top: "Top", new: "New" } as const;
type SortKey = keyof typeof SORTS;

type Family = { root: GameManifest; remixes: GameManifest[] };

function familyRank(fam: Family, stats: Map<string, GameStats>): number {
  const scores = [fam.root, ...fam.remixes].map((g) => rankScore(stats.get(g.slug)!));
  return Math.max(...scores);
}

function familyNewest(fam: Family): string {
  return [fam.root, ...fam.remixes]
    .map((g) => g.createdAt)
    .sort()
    .at(-1)!;
}

export default async function ArcadePage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string; sort?: string }>;
}) {
  const { f, sort } = await searchParams;
  const filter = FILTERS[f ?? "all"] ?? FILTERS.all;
  const sortKey: SortKey = sort === "new" ? "new" : "top";
  const unranked = await listGames();
  const stats = await statsFor(unranked.map((g) => g.slug));
  const ranked = unranked
    .filter(filter.match)
    .sort((a, b) => {
      const diff = rankScore(stats.get(b.slug)!) - rankScore(stats.get(a.slug)!);
      return diff !== 0 ? diff : b.createdAt.localeCompare(a.createdAt);
    });
  const bySlug = new Map(ranked.map((g) => [g.slug, g]));
  const roots = ranked.filter((g) => !g.parent || !bySlug.has(g.parent));
  const families: Family[] = roots.map((root) => ({
    root,
    remixes: ranked.filter((g) => g.parent === root.slug && g.slug !== root.slug),
  }));
  families.sort((a, b) =>
    sortKey === "new"
      ? familyNewest(b).localeCompare(familyNewest(a))
      : familyRank(b, stats) - familyRank(a, stats)
  );
  const topSlug =
    ranked.length > 0 && rankScore(stats.get(ranked[0].slug)!) > 0 ? ranked[0].slug : null;
  const isNew = (g: GameManifest) =>
    Date.now() - new Date(g.createdAt).getTime() < 2 * 60 * 60 * 1000;

  const chipHref = (fKey: string, sKey: SortKey) => {
    const params = new URLSearchParams();
    if (fKey !== "all") params.set("f", fKey);
    if (sKey !== "top") params.set("sort", sKey);
    const qs = params.toString();
    return qs ? `/arcade?${qs}` : "/arcade";
  };

  return (
    <main>
      <SiteNav active="arcade" />

      <header className="masthead" style={{ marginTop: 8 }}>
        <h1>The arcade</h1>
        <p>Say a game, watch it get built, remix anyone&apos;s.</p>
      </header>

      <MyGames />

      <div className="shelfHead">
        <div className="filterRow">
          {Object.entries(FILTERS).map(([key, def]) => (
            <Link
              key={key}
              href={chipHref(key, sortKey)}
              className={
                (f ?? "all") === key ? "filterChip filterChipActive" : "filterChip"
              }
            >
              {def.label}
            </Link>
          ))}
          <span className="filterDivider" aria-hidden="true" />
          {(Object.entries(SORTS) as [SortKey, string][]).map(([key, label]) => (
            <Link
              key={key}
              href={chipHref(f ?? "all", key)}
              className={sortKey === key ? "filterChip filterChipActive" : "filterChip"}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      {families.length === 0 ? (
        <p className="empty">
          {unranked.length === 0
            ? "No games on the shelf yet. The first one lands when the pipeline ships its first verified bundle."
            : "Nothing matches this filter yet. "}
          {unranked.length > 0 && <Link href="/create">Say a game and change that →</Link>}
        </p>
      ) : (
        <div className="grid">
          {families.map(({ root, remixes }) => (
            <article key={root.slug} className="gameCard">
              <Link href={`/g/${root.slug}`} className="gameCover">
                {root.hasCover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/games/${root.slug}/cover.png`} alt="" />
                ) : (
                  <span className="gameCoverFallback">{root.title.charAt(0)}</span>
                )}
              </Link>
              <div className="gameBody">
                <div className="gameTitleRow">
                  <h3>{root.title}</h3>
                  {root.slug === topSlug ? (
                    <span className="badgeFav">★ community favorite</span>
                  ) : (
                    isNew(root) && <span className="badgeNew">NEW</span>
                  )}
                </div>
                <p className="cardByline">by {root.creator ? `@${root.creator}` : "Nova"}</p>
                <p>{root.description}</p>
                <div className="gameActions">
                  <Link href={`/g/${root.slug}`} className="playBtn">
                    ▶&nbsp; Play
                  </Link>
                  <VoteButton slug={root.slug} votes={stats.get(root.slug)!.votes} />
                  <span className="gameControls">
                    {stats.get(root.slug)!.plays} plays
                  </span>
                </div>
                {remixes.length > 0 && (
                  <details className="familyFold">
                    <summary>
                      {remixes.length} {remixes.length === 1 ? "remix" : "remixes"}
                    </summary>
                    <ul className="remixList">
                      {remixes.map((remix) => (
                        <li key={remix.slug} className="remixRow">
                          <Link href={`/g/${remix.slug}`} className="remixTitle">
                            {remix.title}
                            {isNew(remix) && <span className="badgeNew"> NEW</span>}
                          </Link>
                          <span className="tag">
                            {remix.creator ? `@${remix.creator}` : "Nova"}
                          </span>
                          <span className="gameControls">
                            {stats.get(remix.slug)!.plays} plays
                          </span>
                          <Link href={`/g/${remix.slug}`} className="playBtn playBtnSm">
                            ▶
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
