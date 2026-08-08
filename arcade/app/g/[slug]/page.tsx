import Link from "next/link";
import { notFound } from "next/navigation";
import { getGame, listGames } from "@/lib/games";
import { SiteNav } from "../../site-nav";
import { PlayBeacon } from "./play-beacon";
import { QrPanel } from "./qr-panel";

const SITE = "https://playgrokgames.vercel.app";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const game = await getGame(slug);
  if (!game) return {};
  const image = game.hasCover ? `/games/${slug}/cover.png` : "/og.png";
  const description = `${game.description} Play it in your browser, no install.`;
  return {
    title: `${game.title} — Nova`,
    description,
    openGraph: { title: game.title, description, images: [image], url: `${SITE}/g/${slug}` },
    twitter: { card: "summary_large_image", title: game.title, description, images: [image] },
  };
}

export async function generateStaticParams() {
  const games = await listGames();
  return games.map((game) => ({ slug: game.slug }));
}

export default async function GamePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const game = await getGame(slug);
  if (!game) notFound();
  return (
    <main>
      <SiteNav active="arcade" />
      <PlayBeacon slug={slug} />
      <Link href="/arcade" className="back">
        ← Back to the arcade
      </Link>
      <header className="masthead" style={{ marginTop: 16 }}>
        <h1>{game.title}</h1>
        <p>{game.description}</p>
      </header>
      <div className="player">
        <iframe src={`/games/${slug}/index.html`} title={game.title} />
      </div>
      <div className="playerFoot">
        <p className="controls">{game.controls}</p>
        <QrPanel url={`${SITE}/g/${slug}`} />
      </div>
    </main>
  );
}
