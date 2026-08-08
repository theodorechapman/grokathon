import Link from "next/link";
import { listGames } from "@/lib/games";

export default async function ArcadePage() {
  const games = await listGames();
  return (
    <main>
      <header className="masthead">
        <h1>Grok Games</h1>
        <p>Ask Grok for a game. Play it in seconds. Remix it live.</p>
      </header>
      <div className="grid">
        {games.map((game) => (
          <Link key={game.slug} href={`/g/${game.slug}`} className="card">
            <h2>{game.title}</h2>
            <p>{game.description}</p>
            <span className="tag">{game.source}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
