import Link from "next/link";
import styles from "./page.module.css";
import { HeroArt } from "./hero-art";
import { SiteNav } from "./site-nav";
import { listGames } from "@/lib/games";
import { statsFor } from "@/lib/stats";

export const dynamic = "force-dynamic";

const STEPS = [
  { title: "Say it", body: "Reply to the thread with the game you want." },
  { title: "Grok builds it", body: "The pipeline turns your sentence into a playable bundle." },
  { title: "A bot proves it", body: "An agent plays it end to end before it ships." },
  { title: "The thread remixes it", body: "Anyone can fork any game with one more reply." },
];

export default async function LandingPage() {
  const games = (await listGames()).slice(0, 3);
  const stats = await statsFor(games.map((g) => g.slug));

  return (
    <div className={styles.page}>
      <SiteNav active="home" />

      <header className={styles.hero}>
        <HeroArt />
        <div className={styles.heroInner}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/nova-lockup.png" alt="Nova" className={styles.lockup} />
          <p className={styles.tagline}>Every game starts as a sentence.</p>
          <p className={styles.sub}>
            The open source arcade the X community builds one reply at a time.
            Say a game, Grok builds it, a bot proves it playable, and it&apos;s
            live in your browser in seconds. Then the thread remixes it.
          </p>
          <Link href="/arcade" className={styles.heroCta}>
            ▶&nbsp; Enter the arcade
          </Link>
          <p className={styles.chip}>X driven · open source · powered by Grok</p>
        </div>
      </header>

      {games.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>Fresh from the pipeline</h2>
            <Link href="/arcade" className={styles.sectionLink}>
              See all games
            </Link>
          </div>
          <div className={styles.freshGrid}>
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
                  <h3 className={styles.freshTitle}>{game.title}</h3>
                  <p className={styles.freshDesc}>{game.description}</p>
                  <div className={styles.freshFoot}>
                    <Link href={`/g/${game.slug}`} className="playBtn">
                      ▶&nbsp; Play
                    </Link>
                    <span className="gameControls">
                      {stats.get(game.slug)!.plays} plays
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className={styles.section}>
        <h2 className={styles.stripTitle}>How it works</h2>
        <ol className={styles.steps}>
          {STEPS.map((step, i) => (
            <li key={step.title} className={styles.step}>
              <span className={styles.stepNum}>{String(i + 1).padStart(2, "0")}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <footer className={styles.footer}>
        <span>Grokathon · Aug 8 · Supratik, Theo, Henry</span>
        <Link href="/arcade">Enter the arcade</Link>
      </footer>
    </div>
  );
}
