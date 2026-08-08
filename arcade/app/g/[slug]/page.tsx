import { notFound } from "next/navigation";
import { getGame } from "@/lib/games";
import { readSession } from "@/lib/session";
import { pendingJob } from "@/lib/jobs";
import { SiteNav } from "../../site-nav";
import { PlayBeacon } from "./play-beacon";
import { QrPanel } from "./qr-panel";
import { GameFrame } from "./game-frame";
import { RemixBox } from "./remix-box";
import { SignInButton } from "../../sign-in-button";
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

  return (
    <main>
      <SiteNav active="arcade" />
      <PlayBeacon slug={slug} enabled={statsEnabled} />
      {!game.rom && <ScoreClaim slug={slug} signedIn={session !== null} scoring={game.scoring} />}
      <div className="gameHead">
        <header className="masthead">
          <h1>{game.title}</h1>
          <p>{game.description}</p>
        </header>
        <QrPanel url={`${SITE}/g/${slug}`} />
      </div>
      <GameFrame slug={slug} title={game.title} rom={game.rom} timeScored={game.scoring === "time"} signedIn={session !== null} />
      <div className="playerFoot">
        <p className="controls">Instructions: {game.controls}</p>
        {!session && (
          <p className="controls">Sign in with 𝕏 after your run to save your score.</p>
        )}
      </div>
      {session ? (
        <RemixBox parent={slug} />
      ) : (
        <div className="remixGate">
          <p>Sign in with 𝕏 to remix this game</p>
          <SignInButton variant="nav" />
        </div>
      )}
    </main>
  );
}
