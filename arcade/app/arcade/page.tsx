import Link from "next/link";
import { listGames } from "@/lib/games";

export default async function ArcadePage() {
  const games = await listGames();
  return (
    <main>
      <Link href="/" className="back">
        ← Nova
      </Link>
      <header className="masthead" style={{ marginTop: 16 }}>
        <h1>Arcade</h1>
        <p>Every game here was played by a bot and passed before it shipped.</p>
      </header>
      {games.length === 0 ? (
        <p className="empty">
          No games on the shelf yet. The first one lands when the pipeline ships
          its first verified bundle.
        </p>
      ) : (
        <div className="grid">
          {games.map((game) => (
            <Link key={game.slug} href={`/g/${game.slug}`} className="card">
              <h2>{game.title}</h2>
              <p>{game.description}</p>
              <span className="tag">{game.source}</span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
