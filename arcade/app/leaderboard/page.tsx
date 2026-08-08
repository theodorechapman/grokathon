import Link from "next/link";
import { listGames } from "@/lib/games";
import { rankScore, statsFor } from "@/lib/stats";
import { SiteNav } from "../site-nav";

export const dynamic = "force-dynamic";

type Row = { creator: string; games: number; plays: number; votes: number; score: number };

export default async function LeaderboardPage() {
  const games = await listGames();
  const stats = await statsFor(games.map((g) => g.slug));
  const byCreator = new Map<string, Row>();
  for (const game of games) {
    const creator = game.creator ?? "the pipeline";
    const s = stats.get(game.slug)!;
    const row = byCreator.get(creator) ?? { creator, games: 0, plays: 0, votes: 0, score: 0 };
    row.games += 1;
    row.plays += s.plays;
    row.votes += s.votes;
    row.score += rankScore(s);
    byCreator.set(creator, row);
  }
  const rows = [...byCreator.values()].sort((a, b) => b.score - a.score);

  return (
    <main>
      <SiteNav active="arcade" />
      <Link href="/arcade" className="back">
        ← Back to the arcade
      </Link>
      <header className="masthead" style={{ marginTop: 16 }}>
        <h1>Creator leaderboard</h1>
        <p>Ranked by what the crowd does with your games: plays plus 3x votes.</p>
      </header>
      {rows.length === 0 ? (
        <p className="empty">No games, no glory yet. Say a game and claim the top spot.</p>
      ) : (
        <table className="board">
          <thead>
            <tr>
              <th>#</th>
              <th>Creator</th>
              <th>Games</th>
              <th>Plays</th>
              <th>Votes</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.creator}>
                <td>{i + 1}</td>
                <td>{row.creator === "the pipeline" ? row.creator : `@${row.creator}`}</td>
                <td>{row.games}</td>
                <td>{row.plays}</td>
                <td>{row.votes}</td>
                <td>{row.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
