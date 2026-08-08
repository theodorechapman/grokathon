import Link from "next/link";
import { listGames } from "@/lib/games";
import { formatScore, playerBoard, topScores } from "@/lib/stats";
import { readSession } from "@/lib/session";
import { SiteNav } from "../site-nav";
import { SignInButton } from "../sign-in-button";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ g?: string }>;
}) {
  const session = await readSession().catch(() => null);
  if (!session) {
    return (
      <main>
        <SiteNav active="leaderboard" />
        <section className="gate">
          <h1>The leaderboard is for players</h1>
          <p>Sign in to see who&apos;s on top and put your own handle up there.</p>
          <SignInButton variant="big" />
        </section>
      </main>
    );
  }

  const { g } = await searchParams;
  const games = await listGames();
  const selected = games.find((game) => game.slug === g) ?? null;

  return (
    <main>
      <SiteNav active="leaderboard" />
      <header className="masthead" style={{ marginTop: 8 }}>
        <h1>Leaderboard</h1>
        <p>Who plays, and who tops each game&apos;s board.</p>
      </header>

      <div className="filterRow" style={{ marginTop: 24 }}>
        <Link href="/leaderboard" className={!selected ? "filterChip filterChipActive" : "filterChip"}>
          All games
        </Link>
        {games.map((game) => (
          <Link
            key={game.slug}
            href={`/leaderboard?g=${game.slug}`}
            className={selected?.slug === game.slug ? "filterChip filterChipActive" : "filterChip"}
          >
            {game.title}
          </Link>
        ))}
      </div>

      {selected ? (
        <GameBoard slug={selected.slug} title={selected.title} scoring={selected.scoring} />
      ) : (
        <OverallBoard />
      )}
    </main>
  );
}

async function OverallBoard() {
  const rows = await playerBoard();
  if (rows.length === 0) {
    return (
      <p className="empty">
        No signed-in plays yet. Play anything while signed in and you&apos;re on the
        board.
      </p>
    );
  }
  return (
    <table className="board">
      <thead>
        <tr>
          <th>#</th>
          <th>Player</th>
          <th>Plays</th>
          <th>Games played</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={row.handle}>
            <td>{i + 1}</td>
            <td>@{row.handle}</td>
            <td>{row.plays}</td>
            <td>{row.games}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

async function GameBoard({
  slug,
  title,
  scoring,
}: {
  slug: string;
  title: string;
  scoring?: "time" | "points";
}) {
  const scores = await topScores(slug, 20, scoring === "time");
  if (scores.length === 0) {
    return (
      <p className="empty">
        No claimed scores on {title} yet. Finish a run and claim yours.
      </p>
    );
  }
  return (
    <table className="board">
      <thead>
        <tr>
          <th>#</th>
          <th>Player</th>
          <th>{scoring === "time" ? "Fastest clear" : "High score"}</th>
        </tr>
      </thead>
      <tbody>
        {scores.map((row, i) => (
          <tr key={row.handle}>
            <td>{i + 1}</td>
            <td>@{row.handle}</td>
            <td>{formatScore(row.score, scoring)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
