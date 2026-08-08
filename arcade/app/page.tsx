import Link from "next/link";
import styles from "./page.module.css";
import { HeroArt } from "./hero-art";
import { SiteNav } from "./site-nav";

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

      <footer className={styles.footer}>
        <span>Grokathon · Aug 8 · Supratik, Theo, Henry</span>
        <Link href="/arcade">Enter the arcade</Link>
      </footer>
    </div>
  );
}
