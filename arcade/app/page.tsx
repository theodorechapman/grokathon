import Link from "next/link";
import styles from "./page.module.css";

const CHECKS = [
  "boots",
  "input responsive",
  "win state reachable",
  "no crash, no soft-lock",
  "frame budget met",
];

const STAGES = [
  ["ask", "you say the game"],
  ["spec", "grok writes the rules"],
  ["build", "an agent codes it"],
  ["verify", "a bot plays it"],
  ["repair", "fails get fixed"],
  ["ship", "playable link"],
  ["remix", "the room reshapes it"],
] as const;

export default function LandingPage() {
  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <span className={styles.wordmark}>Grok Games</span>
        <Link href="/arcade" className={styles.navCta}>
          Enter arcade
        </Link>
      </nav>

      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Grokathon · Aug 8</p>
          <h1>
            Say a game.
            <br />
            Play it in seconds.
          </h1>
          <p className={styles.sub}>
            Grok builds it, a bot proves it runs, and you reshape it live in plain
            words. Every game is a link anyone can play, no install.
          </p>
          <div className={styles.actions}>
            <Link href="/arcade" className={styles.primary}>
              Enter arcade
            </Link>
            <a href="#how" className={styles.secondary}>
              How it works
            </a>
          </div>
        </div>

        <aside className={styles.telemetry} aria-label="verification checklist">
          <p className={styles.telemetryHead}>verification · pre-ship</p>
          {CHECKS.map((check, i) => (
            <p key={check} className={styles.check} style={{ animationDelay: `${0.4 + i * 0.35}s` }}>
              <span className={styles.mark}>[ ok ]</span> {check}
            </p>
          ))}
          <p className={styles.status} style={{ animationDelay: `${0.4 + CHECKS.length * 0.35 + 0.3}s` }}>
            status: go for ship
          </p>
          <p className={styles.telemetryFoot}>nothing ships unverified</p>
        </aside>
      </header>

      <section className={styles.pipeline} aria-label="pipeline stages">
        {STAGES.map(([name, detail], i) => (
          <div key={name} className={name === "verify" ? styles.stageGate : styles.stage}>
            <span className={styles.stageNum}>{String(i + 1).padStart(2, "0")}</span>
            <span className={styles.stageName}>{name}</span>
            <span className={styles.stageDetail}>{detail}</span>
          </div>
        ))}
      </section>

      <section id="how" className={styles.how}>
        <article>
          <h2>A bot plays it before you do</h2>
          <p>
            Every generated game gets played by an agent first: does it boot, does
            input work, can you actually win. Fail and it repairs itself and
            retries. The gate is the product.
          </p>
        </article>
        <article>
          <h2>Remix it in plain words</h2>
          <p>
            &ldquo;Make gravity low.&rdquo; &ldquo;Two players.&rdquo; The game
            patches live, re-verifies, and everyone playing gets the new version.
            The room shapes the game together.
          </p>
        </article>
        <article>
          <h2>One link, three surfaces</h2>
          <p>
            Create in Grok. Play in the browser on any phone. Share on X as a
            playable card that pulls the next person in. No install anywhere.
          </p>
        </article>
        <article>
          <h2>The crowd ranks the arcade</h2>
          <p>
            Upvotes, completions, remixes with credit to the original. The machine
            grades playable, the crowd grades fun, and the shelf stays worth
            browsing.
          </p>
        </article>
      </section>

      <footer className={styles.footer}>
        <span>Grokathon · Aug 8 · Supratik, Theo, Henry</span>
        <Link href="/arcade" className={styles.footerLink}>
          Enter arcade
        </Link>
      </footer>
    </div>
  );
}
