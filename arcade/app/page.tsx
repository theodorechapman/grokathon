import Link from "next/link";
import styles from "./page.module.css";
import { HeroArt } from "./hero-art";

const HOW = [
  {
    title: "A bot plays it before you do",
    body: "Every generated game gets played by an agent first: does it boot, does input work, can you actually win. Fail and it repairs itself and retries. The gate is the product.",
  },
  {
    title: "Remix it in plain words",
    body: "“Make gravity low.” “Two players.” The game patches live, re-verifies, and everyone playing gets the new version. The room shapes the game together.",
  },
  {
    title: "One link, three surfaces",
    body: "Create in Grok. Play in the browser on any phone. Share on X as a playable card that pulls the next person in. No install anywhere.",
  },
  {
    title: "The crowd ranks the arcade",
    body: "Upvotes, completions, remixes with credit to the original. The machine grades playable, the crowd grades fun, and the shelf stays worth browsing.",
  },
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
        <div className={styles.navPill}>
          <Link href="/arcade" className={styles.navActive}>
            Arcade
          </Link>
          <a href="#how">How it works</a>
        </div>
      </nav>

      <header className={styles.hero}>
        <HeroArt />
        <div className={styles.heroInner}>
          <h1>Grok Games</h1>
          <p>Say a game. Play it in seconds. Remix it live with the room.</p>
          <Link href="/arcade" className={styles.heroCta}>
            ▶&nbsp; Enter arcade
          </Link>
        </div>
      </header>

      <section id="how" className={styles.section}>
        <h2>How it works</h2>
        <p className={styles.sectionSub}>
          Grok builds it, a bot proves it runs, and every game is a link anyone can
          play. No install.
        </p>
        <div className={styles.cards}>
          {HOW.map((item) => (
            <article key={item.title} className={styles.card}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2>The pipeline</h2>
        <p className={styles.sectionSub}>
          Seven stages from your sentence to a playable link. Verify is the gate:
          nothing ships unverified.
        </p>
        <div className={styles.stages}>
          {STAGES.map(([name, detail], i) => (
            <div key={name} className={name === "verify" ? styles.stageGate : styles.stage}>
              <span className={styles.stageNum}>{String(i + 1).padStart(2, "0")}</span>
              <span className={styles.stageName}>{name}</span>
              <span className={styles.stageDetail}>{detail}</span>
            </div>
          ))}
        </div>
      </section>

      <footer className={styles.footer}>
        <span>Grokathon · Aug 8 · Supratik, Theo, Henry</span>
        <Link href="/arcade">Enter arcade</Link>
      </footer>
    </div>
  );
}
