import Link from "next/link";
import { listPublicGames, type GameManifest } from "@/lib/games";
import { rankScore, redis, statsFor, type GameStats } from "@/lib/stats";
import { SiteNav } from "../site-nav";
import { MyGames } from "./my-games";
import { VoteButton } from "./vote-button";

export const dynamic = "force-dynamic";

const VIEWS = {
  favorites: "Community favorites",
  all: "All",
  new: "New",
} as const;
type ViewKey = keyof typeof VIEWS;

// Hand-picked shelf headliners. They get the star badge and the favorites tab.
const FAVORITES = new Set(["breakout", "snake", "yo-can-you-make-20ebef"]);

type Family = { root: GameManifest; remixes: GameManifest[] };

function familyPlays(fam: Family, stats: Map<string, GameStats>): number {
  return Math.max(...[fam.root, ...fam.remixes].map((g) => stats.get(g.slug)!.plays));
}

const PLAYER_OPTIONS: { value: string; label: string; match: (g: GameManifest) => boolean }[] = [
  { value: "1", label: "1 player", match: (g) => (g.players ?? 1) === 1 },
  { value: "2", label: "2 players", match: (g) => g.players === 2 },
];

export default async function ArcadePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; p?: string; sort?: string }>;
}) {
  const { view: viewParam, p, sort } = await searchParams;
  // Old ?sort= and ?view=top links keep working: anything unknown lands on favorites.
  const requested = viewParam ?? sort;
  const view: ViewKey =
    requested === "all" || requested === "new" ? requested : "favorites";
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
  // Favorites is the hand-picked set, New is flat newest first. All is
  // family-stacked: one card per root game ranked by plays, remixes folded in.
  const roots = ranked.filter((g) => !g.parent || !bySlug.has(g.parent));
  const families: Family[] = roots.map((root) => ({
    root,
    remixes: ranked.filter((g) => g.parent === root.slug && g.slug !== root.slug),
  }));
  families.sort((a, b) => {
    const diff = familyPlays(b, stats) - familyPlays(a, stats);
    return diff !== 0 ? diff : b.root.createdAt.localeCompare(a.root.createdAt);
  });
  const remixesOf = new Map(families.map((f) => [f.root.slug, f.remixes]));
  let cards: GameManifest[];
  if (view === "favorites") {
    cards = ranked.filter((g) => FAVORITES.has(g.slug));
  } else if (view === "new") {
    cards = [...ranked].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } else {
    cards = families.map((f) => f.root);
  }
  const isNew = (g: GameManifest) =>
    Date.now() - new Date(g.createdAt).getTime() < 2 * 60 * 60 * 1000;

  const href = (v: ViewKey, ps: string[]) => {
    const params = new URLSearchParams();
    if (v !== "favorites") params.set("view", v);
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
              {cards.map((game) => (
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
                      {FAVORITES.has(game.slug) ? (
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
                    {view === "all" && (remixesOf.get(game.slug) ?? []).length > 0 && (
                      <details className="familyFold">
                        <summary>
                          {remixesOf.get(game.slug)!.length}{" "}
                          {remixesOf.get(game.slug)!.length === 1 ? "remix" : "remixes"}
                        </summary>
                        <ul className="remixList">
                          {remixesOf.get(game.slug)!.map((remix) => (
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
                              {tweetUrl(remix.slug) && (
                                <a
                                  href={tweetUrl(remix.slug)!}
                                  className="xThreadLink"
                                  title="View the thread on X"
                                >
                                  𝕏
                                </a>
                              )}
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
        </div>
      </div>
    </main>
  );
}
