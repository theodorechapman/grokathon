import Link from "next/link";
import { listPublicGames, type GameManifest } from "@/lib/games";
import { rankScore, statsFor, type GameStats } from "@/lib/stats";
import { SiteNav } from "../site-nav";
import { MyGames } from "./my-games";
import { VoteButton } from "./vote-button";

export const dynamic = "force-dynamic";

const VIEWS = { all: "All", top: "Community favorites", new: "New" } as const;
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
  const view: ViewKey = requested === "top" || requested === "new" ? requested : "all";
  const players = (p ?? "")
    .split(",")
    .filter((v) => PLAYER_OPTIONS.some((o) => o.value === v));

  const unranked = await listPublicGames();
  const stats = await statsFor(unranked.map((g) => g.slug));
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
  // All and New are flat: every game, remixes included, its own card.
  // Community favorites shows one winner per family — the thread's best game.
  let cards: GameManifest[];
  if (view === "top") {
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
        <p>Say a game, watch it get built, remix anyone&apos;s.</p>
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
