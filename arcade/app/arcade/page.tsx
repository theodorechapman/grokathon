import Link from "next/link";
import { listGames, type GameManifest } from "@/lib/games";
import { rankScore, statsFor } from "@/lib/stats";
import { SiteNav } from "../site-nav";
import { CreateBox } from "./create-box";
import { MyGames } from "./my-games";
import { VoteButton } from "./vote-button";

export const dynamic = "force-dynamic";

const FILTERS: Record<string, { label: string; match: (g: GameManifest) => boolean }> = {
  all: { label: "All", match: () => true },
  "1p": { label: "1 player", match: (g) => (g.players ?? 1) === 1 },
  "2p": { label: "2 players", match: (g) => g.players === 2 },
  "rom-re": { label: "Reverse-engineered", match: (g) => g.source === "rom-re" },
  "prompt-gen": { label: "Prompted", match: (g) => g.source === "prompt-gen" },
  remix: { label: "Remixes", match: (g) => g.source === "remix" },
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
  const games = unranked
    .filter(filter.match)
    .sort((a, b) => {
      const diff = rankScore(stats.get(b.slug)!) - rankScore(stats.get(a.slug)!);
      return diff !== 0 ? diff : b.createdAt.localeCompare(a.createdAt);
    });
  return (
    <main>
      <SiteNav active="arcade" />

      <section className="welcome">
        <div className="welcomeText">
          <h1>The arcade</h1>
          <p>
            Every game here started as a sentence and was played by a bot before
            it shipped. Say a new one and it lands on this shelf.
          </p>
        </div>
        <CreateBox />
      </section>

      <MyGames />

      <div className="shelfHead">
        <div className="shelfTitleRow">
          <div>
            <h2>Global games</h2>
            <p>Play instantly in your browser. Remix anything you like.</p>
          </div>
          <Link href="/leaderboard" className="leaderboardLink">
            Creator leaderboard →
          </Link>
        </div>
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
                <div className="gameTitleRow">
                  <h3>{game.title}</h3>
                  <span className="tag">{game.source}</span>
                </div>
                {game.creator && <p className="byline">by @{game.creator}</p>}
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
