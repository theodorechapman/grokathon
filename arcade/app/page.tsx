import Link from "next/link";
import styles from "./page.module.css";
import { HeroArt } from "./hero-art";
import { SiteNav } from "./site-nav";

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

export default function LandingPage() {
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
            Say it, and Nova makes it real: built by Grok, proven playable by a
            bot, live in your browser in seconds. Then the room remixes it.
          </p>
          <Link href="/arcade" className={styles.heroCta}>
            ▶&nbsp; Enter the arcade
          </Link>
          <p className={styles.chip}>built on Grok</p>
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

      <footer className={styles.footer}>
        <span>Grokathon · Aug 8 · Supratik, Theo, Henry</span>
        <Link href="/arcade">Enter the arcade</Link>
      </footer>
    </div>
  );
}
