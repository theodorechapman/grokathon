import Link from "next/link";
import { listGames } from "@/lib/games";
import { rankScore, statsFor, topScores } from "@/lib/stats";
import { SiteNav } from "../site-nav";

export const dynamic = "force-dynamic";

type Row = { creator: string; games: number; plays: number; votes: number; score: number };

export default async function LeaderboardPage() {
  const games = await listGames();
  const stats = await statsFor(games.map((g) => g.slug));
  const perGame = await Promise.all(
    games.map(async (g) => ({ game: g, top: await topScores(g.slug, 3) }))
  );

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
      <SiteNav active="leaderboard" />
      <header className="masthead" style={{ marginTop: 8 }}>
        <h1>Leaderboard</h1>
        <p>Creators ranked by what the crowd does with their games. Players ranked per game.</p>
      </header>

      <div className="shelfHead">
        <h2>Creators</h2>
        <p>Plays plus 3x votes across everything they&apos;ve made.</p>
      </div>
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

      <div className="shelfHead">
        <h2>High scores by game</h2>
        <p>Sign in with X after a run to put your handle on a board.</p>
      </div>
      {perGame.length === 0 ? (
        <p className="empty">Boards appear as games land on the shelf.</p>
      ) : (
        <div className="boardsGrid">
          {perGame.map(({ game, top }) => (
            <div key={game.slug} className="highScores">
              <h2>
                <Link href={`/g/${game.slug}`}>{game.title}</Link>
              </h2>
              {top.length === 0 ? (
                <p className="boardEmpty">No claimed scores yet. Be first.</p>
              ) : (
                <ol>
                  {top.map((row) => (
                    <li key={row.handle}>
                      <span>@{row.handle}</span>
                      <span>{row.score.toLocaleString()}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
