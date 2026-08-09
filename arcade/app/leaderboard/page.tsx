import Link from "next/link";
import { listPublicGames } from "@/lib/games";
import { formatScore, playerBoard, rankScore, redis, statsFor, topScores } from "@/lib/stats";
import { guestDisplayName } from "@/lib/guest-name";
import { GuestNameBox } from "./guest-name-box";
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
  const unordered = await listPublicGames();
  const slugs = new Set(unordered.map((x) => x.slug));
  const rootsList = unordered.filter((x) => !x.parent || !slugs.has(x.parent));
  const selected = unordered.find((game) => game.slug === g) ?? null;
  // The family in view: the selected game's root, so remix chips only show in context.
  const selectedRoot =
    selected && selected.parent && slugs.has(selected.parent)
      ? unordered.find((x) => x.slug === selected.parent) ?? null
      : selected;
  // Full remix tree under the selected root, hottest branches first at every
  // level, remix-of-remix indented one arrow deeper.
  const stats = await statsFor(unordered.map((x) => x.slug));
  const byHeat = (a: { slug: string }, b: { slug: string }) =>
    rankScore(stats.get(b.slug) ?? { votes: 0, plays: 0 }) -
    rankScore(stats.get(a.slug) ?? { votes: 0, plays: 0 });
  const familyRemixes: { slug: string; title: string; depth: number; plays: number; votes: number }[] = [];
  function collectRemixes(parentSlug: string, depth: number) {
    if (depth > 4) return;
    for (const child of unordered.filter((x) => x.parent === parentSlug).sort(byHeat)) {
      const s = stats.get(child.slug) ?? { votes: 0, plays: 0 };
      familyRemixes.push({ slug: child.slug, title: child.title, depth, plays: s.plays, votes: s.votes });
      collectRemixes(child.slug, depth + 1);
    }
  }
  if (selectedRoot) collectRemixes(selectedRoot.slug, 1);
  rootsList.sort(byHeat);

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

      <div className="shelfLayout" style={{ marginTop: 24 }}>
        <aside className="filterRail">
          <div className="railGroup">
            <h4 className="railLabel">Game</h4>
            <Link
              href="/leaderboard"
              className={!selected ? "railCheck railCheckOn" : "railCheck"}
            >
              All games
            </Link>
            {rootsList.map((game) => (
              <div key={game.slug}>
                <Link
                  href={`/leaderboard?g=${game.slug}`}
                  className={selected?.slug === game.slug ? "railCheck railCheckOn" : "railCheck"}
                >
                  {game.title}
                </Link>
                {selectedRoot?.slug === game.slug && familyRemixes.length > 0 && (
                  <nav className="boardFamList">
                    {familyRemixes.map((remix) => (
                      <Link
                        key={remix.slug}
                        href={`/leaderboard?g=${remix.slug}`}
                        className={
                          selected?.slug === remix.slug
                            ? "boardFamRow boardFamRowActive"
                            : "boardFamRow"
                        }
                        style={{ paddingLeft: 12 + (remix.depth - 1) * 14 }}
                      >
                        <span className="boardFamTitle">↳ {remix.title}</span>
                        <span className="boardFamStats">{remix.plays} plays</span>
                      </Link>
                    ))}
                  </nav>
                )}
              </div>
            ))}
          </div>
        </aside>

        <div className="shelfMain">
          {!session && (
            <>
              <div className="boardGate">
                <span>Playing as a guest. Sign in to claim your plays under your handle.</span>
                <SignInButton variant="nav" />
              </div>
              <GuestNameBox />
            </>
          )}

          {selected ? (
            <GameBoard slug={selected.slug} title={selected.title} scoring={selected.scoring} />
          ) : (
            <OverallBoard />
          )}
        </div>
      </div>
    </main>
  );
}

async function OverallBoard() {
  const rows = await playerBoard();
  const customNames =
    (await redis()?.hgetall<Record<string, string>>("guest:names").catch(() => null)) ?? {};
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
          const display = guest
            ? customNames[row.handle] ?? guestDisplayName(row.handle.slice(6))
            : `@${row.handle}`;
          return (
            <tr key={row.handle} className={guest ? "guestRow" : undefined}>
              <td>{i + 1}</td>
              <td>{display}</td>
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
