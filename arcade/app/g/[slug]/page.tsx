import Link from "next/link";
import { notFound } from "next/navigation";
import { getGame, listGames } from "@/lib/games";
import { readSession } from "@/lib/session";
import { pendingJob } from "@/lib/jobs";
import { SiteNav } from "../../site-nav";
import { PlayBeacon } from "./play-beacon";
import { QrPanel } from "./qr-panel";
import { GameFrame } from "./game-frame";
import { RemixBox } from "./remix-box";
import { SignInButton } from "../../sign-in-button";
import { WaitingRoom } from "./waiting-room";

const SITE = "https://playgrokgames.vercel.app";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const game = await getGame(slug);
  if (!game) return { title: "Being built — Nova" };
  const image = game.hasCover ? `/games/${slug}/cover.png` : "/og.png";
  const description = `${game.description} Play it in your browser, no install.`;
  return {
    title: `${game.title} — Nova`,
    description,
    openGraph: { title: game.title, description, images: [image], url: `${SITE}/g/${slug}` },
    twitter: { card: "summary_large_image", title: game.title, description, images: [image] },
  };
}

export default async function GamePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const game = await getGame(slug);
  const statsEnabled = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

  if (!game) {
    const job = await pendingJob(slug);
    if (!job) notFound();
    return (
      <main>
        <SiteNav active="arcade" />
        <WaitingRoom slug={slug} status={job.status} />
      </main>
    );
  }

  const session = await readSession().catch(() => null);
  const all = await listGames();
  const parent = game.parent ? all.find((g) => g.slug === game.parent) : null;
  const remixes = all.filter((g) => g.parent === slug);

  return (
    <main>
      <SiteNav active="arcade" />
      <PlayBeacon slug={slug} enabled={statsEnabled} />
      <div className="gameHead">
        <header className="masthead">
          {parent && (
            <p className="remixOf">
              ↳ remix of <Link href={`/g/${parent.slug}`}>{parent.title}</Link>
            </p>
          )}
          <h1>{game.title}</h1>
          <p>{game.description}</p>
          <a href="#remix" className="filterChip remixJump">
            ↳ Remix this game
          </a>
        </header>
        <QrPanel url={`${SITE}/g/${slug}`} />
      </div>
      <GameFrame slug={slug} title={game.title} rom={game.rom} scoring={game.scoring ?? "points"} signedIn={session !== null} />
      <div className="playerFoot">
        <p className="controls">Instructions: {game.controls}</p>
        {!session && (
          <p className="controls">Sign in with 𝕏 after your run to save your score.</p>
        )}
      </div>
      <section id="remix" className="remixPanel">
        <h2>Want to remix {game.title}?</h2>
        <p>
          Say a sentence and a new version ships in about 90 seconds. Try &quot;make the
          paddle tiny and the ball twice as fast&quot;.
        </p>
        {session ? (
          <RemixBox parent={slug} />
        ) : (
          <div className="remixGate">
            <p>Sign in with 𝕏 to remix this game</p>
            <SignInButton variant="nav" />
          </div>
        )}
      </section>

      {remixes.length > 0 && (
        <section className="remixPanel">
          <h2>Remixes of {game.title}</h2>
          <ul className="remixList">
            {remixes.map((remix) => (
              <li key={remix.slug} className="remixRow">
                <Link href={`/g/${remix.slug}`} className="remixTitle">
                  {remix.title}
                </Link>
                <span className="tag">{remix.creator ? `@${remix.creator}` : "Nova"}</span>
                <Link href={`/g/${remix.slug}`} className="playBtn playBtnSm">
                  ▶
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
