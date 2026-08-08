import Link from "next/link";
import { notFound } from "next/navigation";
import { getGame, listGames } from "@/lib/games";

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
      <Link href="/" className="back">
        ← arcade
      </Link>
      <header className="masthead" style={{ marginTop: 16 }}>
        <h1>{game.title}</h1>
        <p>{game.description}</p>
      </header>
      <div className="player">
        <iframe src={`/games/${slug}/index.html`} title={game.title} />
      </div>
      <p className="controls">{game.controls}</p>
    </main>
  );
}
