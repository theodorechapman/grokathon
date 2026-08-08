import Link from "next/link";
import { listGames } from "@/lib/games";
import { rankScore, statsFor } from "@/lib/stats";
import { SiteNav } from "../site-nav";
import { CreateBox } from "./create-box";
import { VoteButton } from "./vote-button";

export const dynamic = "force-dynamic";

export default async function ArcadePage() {
  const unranked = await listGames();
  const stats = await statsFor(unranked.map((g) => g.slug));
  const games = [...unranked].sort((a, b) => {
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

      <div className="shelfHead">
        <h2>Games</h2>
        <p>Play instantly in your browser. Remix anything you like.</p>
      </div>

      {games.length === 0 ? (
        <p className="empty">
          No games on the shelf yet. The first one lands when the pipeline ships
          its first verified bundle.
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
