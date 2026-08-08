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

      <footer className={styles.footer}>
        <span>Grokathon · Aug 8 · Supratik, Theo, Henry</span>
        <Link href="/arcade">Enter the arcade</Link>
      </footer>
    </div>
  );
}
