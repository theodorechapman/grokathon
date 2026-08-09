import Link from "next/link";
import { listPublicGames, type GameManifest } from "@/lib/games";
import { rankScore, redis, statsFor, type GameStats } from "@/lib/stats";
import { SiteNav } from "../site-nav";
import { MyGames } from "./my-games";
import { VoteButton } from "./vote-button";

export const dynamic = "force-dynamic";

const VIEWS = {
  top: "Top games",
  favorites: "Community favorites",
  all: "All",
  new: "New",
} as const;
type ViewKey = keyof typeof VIEWS;

const PLAYER_OPTIONS: { value: string; label: string; match: (g: GameManifest) => boolean }[] = [
  { value: "1", label: "1 player", match: (g) => (g.players ?? 1) === 1 },
  { value: "2", label: "2 players", match: (g) => g.players === 2 },
];

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

function familyHasActivity(fam: Family, stats: Map<string, GameStats>): boolean {
  return [fam.root, ...fam.remixes].some((g) => {
    const s = stats.get(g.slug)!;
    return s.votes > 0 || s.plays > 0;
  });
}

export default async function ArcadePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; p?: string; sort?: string }>;
}) {
  const { view: viewParam, p, sort } = await searchParams;
  // Old ?sort=top|new links keep working as aliases for the view param.
  const requested = viewParam ?? sort;
  const view: ViewKey =
    requested === "all" || requested === "new" || requested === "favorites"
      ? requested
      : "top";
  const players = (p ?? "")
    .split(",")
    .filter((v) => PLAYER_OPTIONS.some((o) => o.value === v));

  const unranked = await listPublicGames();
  const stats = await statsFor(unranked.map((g) => g.slug));
  // Every game links back to its X announcement — the thread IS the product story.
  const gameposts =
    (await redis()?.hgetall<Record<string, string>>("x:gamepost").catch(() => null)) ?? {};
  const tweetUrl = (slug: string) => {
    const id = /^t(\d+)$/.exec(gameposts[slug] ?? "")?.[1];
    return id ? `https://x.com/suprapan07/status/${id}` : null;
  };
  const ranked = unranked
    .filter(
      (g) =>
        players.length === 0 ||
        PLAYER_OPTIONS.some((o) => players.includes(o.value) && o.match(g))
    )
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
  // Top games (default) is family-stacked: one card per unique game, remixes
  // folded in. All and New are flat. Community favorites is one winner per
  // family — the thread's best game by votes and plays.
  families.sort((a, b) => familyRank(b, stats) - familyRank(a, stats));
  let cards: GameManifest[];
  if (view === "favorites") {
    cards = families
      .filter((fam) => familyHasActivity(fam, stats))
      .map((fam) =>
        [fam.root, ...fam.remixes].reduce((best, g) =>
          rankScore(stats.get(g.slug)!) > rankScore(stats.get(best.slug)!) ? g : best
        )
      )
      .sort((a, b) => rankScore(stats.get(b.slug)!) - rankScore(stats.get(a.slug)!));
  } else if (view === "new") {
    cards = [...ranked].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } else {
    cards = ranked;
  }
  const topSlug =
    ranked.length > 0 && rankScore(stats.get(ranked[0].slug)!) > 0 ? ranked[0].slug : null;
  const isNew = (g: GameManifest) =>
    Date.now() - new Date(g.createdAt).getTime() < 2 * 60 * 60 * 1000;

  const href = (v: ViewKey, ps: string[]) => {
    const params = new URLSearchParams();
    if (v !== "all") params.set("view", v);
    if (ps.length > 0) params.set("p", ps.join(","));
    const qs = params.toString();
    return qs ? `/arcade?${qs}` : "/arcade";
  };
  const toggleHref = (value: string) =>
    href(
      view,
      players.includes(value) ? players.filter((v) => v !== value) : [...players, value]
    );

  return (
    <main>
      <SiteNav active="arcade" />

      <header className="masthead" style={{ marginTop: 8 }}>
        <h1>The arcade</h1>
        <p>Pick a game and play. Beat the board, then remix it into your own.</p>
      </header>

      <MyGames />

      <div className="shelfLayout">
        <aside className="filterRail">
          <div className="railGroup">
            <h4 className="railLabel">Players</h4>
            {PLAYER_OPTIONS.map((opt) => {
              const checked = players.includes(opt.value);
              return (
                <Link
                  key={opt.value}
                  href={toggleHref(opt.value)}
                  className={checked ? "railCheck railCheckOn" : "railCheck"}
                  aria-pressed={checked}
                >
                  <span className="railBox" aria-hidden="true">
                    {checked ? "✓" : ""}
                  </span>
                  {opt.label}
                </Link>
              );
            })}
          </div>
        </aside>

        <div className="shelfMain">
          <div className="filterRow">
            {(Object.entries(VIEWS) as [ViewKey, string][]).map(([key, label]) => (
              <Link
                key={key}
                href={href(key, players)}
                className={view === key ? "filterChip filterChipActive" : "filterChip"}
              >
                {label}
              </Link>
            ))}
          </div>
          {cards.length === 0 ? (
            <p className="empty">
              {unranked.length === 0
                ? "No games on the shelf yet. The first one lands when the pipeline ships its first verified bundle."
                : "Nothing matches this filter yet. "}
              {unranked.length > 0 && <Link href="/create">Say a game and change that →</Link>}
            </p>
          ) : (
            <div className="grid">
              {view === "top" &&
                families.map(({ root, remixes }) => (
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
                        <span className="gameControls">{stats.get(root.slug)!.plays} plays</span>
                        {tweetUrl(root.slug) && (
                          <a
                            href={tweetUrl(root.slug)!}
                            className="xThreadLink"
                            title="View the thread on X"
                          >
                            𝕏 thread
                          </a>
                        )}
                      </div>
                      {remixes.length > 0 && (
                        <details className="familyFold">
                          <summary>
                            {remixes.length} {remixes.length === 1 ? "remix" : "remixes"}
                          </summary>
                          <ul className="remixList">
                            {remixes.map((remix) => (
                              <li key={remix.slug} className="remixRow">
                                <span className="remixMain">
                                  <Link href={`/g/${remix.slug}`} className="remixTitle">
                                    {remix.title}
                                  </Link>
                                  <span className="cardByline">
                                    by {remix.creator ? `@${remix.creator}` : "Nova"}
                                  </span>
                                </span>
                                {isNew(remix) && <span className="badgeNew">NEW</span>}
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
              {view !== "top" &&
                cards.map((game) => (
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
                      <p className="remixOf">
                        ↳ remix of {bySlug.get(game.parent)!.title}
                      </p>
                    )}
                    <div className="gameTitleRow">
                      <h3>{game.title}</h3>
                      {game.slug === topSlug ? (
                        <span className="badgeFav">★ community favorite</span>
                      ) : (
                        isNew(game) && <span className="badgeNew">NEW</span>
                      )}
                    </div>
                    <p className="cardByline">by {game.creator ? `@${game.creator}` : "Nova"}</p>
                    <p>{game.description}</p>
                    <div className="gameActions">
                      <Link href={`/g/${game.slug}`} className="playBtn">
                        ▶&nbsp; Play
                      </Link>
                      <VoteButton slug={game.slug} votes={stats.get(game.slug)!.votes} />
                      <span className="gameControls">
                        {stats.get(game.slug)!.plays} plays
                      </span>
                      {tweetUrl(game.slug) && (
                        <a
                          href={tweetUrl(game.slug)!}
                          className="xThreadLink"
                          title="View the thread on X"
                        >
                          𝕏 thread
                        </a>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
