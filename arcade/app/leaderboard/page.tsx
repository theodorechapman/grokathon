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
  const { g } = await searchParams;
  const unordered = await listGames();
  const slugs = new Set(unordered.map((x) => x.slug));
  const rootsList = unordered.filter((x) => !x.parent || !slugs.has(x.parent));
  const selected = unordered.find((game) => game.slug === g) ?? null;
  // The family in view: the selected game's root, so remix chips only show in context.
  const selectedRoot =
    selected && selected.parent && slugs.has(selected.parent)
      ? unordered.find((x) => x.slug === selected.parent) ?? null
      : selected;
  const familyRemixes = selectedRoot
    ? unordered.filter((x) => x.parent === selectedRoot.slug && x.slug !== selectedRoot.slug)
    : [];

  return (
    <main>
      <SiteNav active="leaderboard" />
      <header className="masthead" style={{ marginTop: 8 }}>
        <h1>Leaderboard</h1>
        <p>
          Every visitor who plays is on the global board. Sign in with 𝕏 to claim
          your handle and put scores on the game boards.
        </p>
      </header>

      <div className="filterRow" style={{ marginTop: 24 }}>
        <Link href="/leaderboard" className={!selected ? "filterChip filterChipActive" : "filterChip"}>
          All games
        </Link>
        {rootsList.map((game) => (
          <Link
            key={game.slug}
            href={`/leaderboard?g=${game.slug}`}
            className={selectedRoot?.slug === game.slug ? "filterChip filterChipActive" : "filterChip"}
          >
            {game.title}
          </Link>
        ))}
      </div>
      {familyRemixes.length > 0 && (
        <div className="filterRow" style={{ marginTop: 10 }}>
          {familyRemixes.map((game) => (
            <Link
              key={game.slug}
              href={`/leaderboard?g=${game.slug}`}
              className={selected?.slug === game.slug ? "filterChip filterChipActive" : "filterChip"}
            >
              ↳ {game.title}
            </Link>
          ))}
        </div>
      )}
      {!session && (
        <div className="boardGate">
          <span>Playing as a guest. Sign in to claim your plays under your handle.</span>
          <SignInButton variant="nav" />
        </div>
      )}

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
        {rows.map((row, i) => {
          const guest = row.handle.startsWith("guest:");
          return (
            <tr key={row.handle} className={guest ? "guestRow" : undefined}>
              <td>{i + 1}</td>
              <td>{guest ? `guest-${row.handle.slice(6, 12)}` : `@${row.handle}`}</td>
              <td>{row.plays}</td>
              <td>{row.games}</td>
            </tr>
          );
        })}
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
