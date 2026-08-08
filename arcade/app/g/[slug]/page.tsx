import { notFound } from "next/navigation";
import { getGame } from "@/lib/games";
import { topScores } from "@/lib/stats";
import { readSession } from "@/lib/session";
import { pendingJob } from "@/lib/jobs";
import { SiteNav } from "../../site-nav";
import { PlayBeacon } from "./play-beacon";
import { QrPanel } from "./qr-panel";
import { GameFrame } from "./game-frame";
import { RemixBox } from "./remix-box";
import { ScoreClaim } from "./score-claim";
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

  const [scores, session] = await Promise.all([
    topScores(slug),
    readSession().catch(() => null),
  ]);

  return (
    <main>
      <SiteNav active="arcade" />
      <PlayBeacon slug={slug} />
      <ScoreClaim slug={slug} signedIn={session !== null} />
      <div className="gameHead">
        <header className="masthead">
          <h1>{game.title}</h1>
          <p>{game.description}</p>
        </header>
        <QrPanel url={`${SITE}/g/${slug}`} />
      </div>
      <GameFrame slug={slug} title={game.title} />
      <div className="playerFoot">
        <p className="controls">{game.controls}</p>
        {!session && (
          <p className="controls">Sign in with 𝕏 after your run to save your score.</p>
        )}
      </div>
      {scores.length > 0 && (
        <div className="highScores">
          <h2>High scores</h2>
          <ol>
            {scores.map((row) => (
              <li key={row.handle}>
                <span>@{row.handle}</span>
                <span>{row.score.toLocaleString()}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      <RemixBox parent={slug} />
    </main>
  );
}
