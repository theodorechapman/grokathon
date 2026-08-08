import Link from "next/link";
import { listGames } from "@/lib/games";
import { SiteNav } from "../site-nav";

export default async function ArcadePage() {
  const games = await listGames();
  return (
    <main>
      <SiteNav active="arcade" />

      <section className="welcome">
        <div>
          <h1>The arcade</h1>
          <p>
            Every game here started as a sentence and was played by a bot before
            it shipped. Say a new one in Grok and it lands on this shelf.
          </p>
        </div>
        <Link href="/#how" className="welcomeCta">
          How it works
        </Link>
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
                  <span className="gameControls">{game.controls}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
