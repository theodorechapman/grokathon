import Link from "next/link";
import { notFound } from "next/navigation";
import { access } from "fs/promises";
import path from "path";
import { getGame, listGames } from "@/lib/games";
import { redis } from "@/lib/stats";
import { readSession } from "@/lib/session";
import { pendingJob } from "@/lib/jobs";
import { SiteNav } from "../../site-nav";
import { PlayBeacon } from "./play-beacon";
import { QrPanel } from "./qr-panel";
import { GameFrame } from "./game-frame";
import { RemixBox } from "./remix-box";
import { DraftPanel } from "./draft-panel";
import { SignInButton } from "../../sign-in-button";
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

  const isCreator = Boolean(session && game.creator && session.handle === game.creator);
  if (game.draft && !isCreator) {
    return (
      <main>
        <SiteNav active="arcade" />
        <div className="waiting">
          <h1>This draft isn&apos;t public yet</h1>
          <p className="waitingNote">
            The creator is still iterating on it. Check back after they publish
            it, or <Link href="/arcade">browse the arcade</Link> meanwhile.
          </p>
        </div>
      </main>
    );
  }

  const all = await listGames();
  const parent = game.parent ? all.find((g) => g.slug === game.parent) : null;
  const remixes = all.filter((g) => g.parent === slug && !g.draft);

  type BuildLog = { stages: { name: string; at: number }[]; startedAt: number };
  const r = redis();
  const buildLog = r
    ? await r.get<BuildLog>(`jobstatus:${slug}`).catch(() => null)
    : null;
  const packedTweet = r
    ? await r.hget<string>("x:gamepost", slug).catch(() => null)
    : null;
  const tweetId = /^t(\d+)$/.exec(packedTweet ?? "")?.[1] ?? null;
  const hasSource = await access(path.join(process.cwd(), "public", "games", slug, "source.c"))
    .then(() => true)
    .catch(() => false);

  return (
    <main>
      <SiteNav active="arcade" />
      <PlayBeacon slug={slug} enabled={statsEnabled} />
      <div className="gameHead">
        <header className="masthead">
          {parent && (
            <p className="remixOf">
              ↳ remix of <Link href={`/g/${parent.slug}`}>{parent.title}</Link>
            </p>
          )}
          <h1>
            {game.title}
            {game.draft && <span className="draftBadge">DRAFT</span>}
          </h1>
          <p>{game.description}</p>
          {!game.draft && (
            <a href="#remix" className="filterChip remixJump">
              ↳ Remix this game
            </a>
          )}
        </header>
        <QrPanel url={`${SITE}/g/${slug}`} />
      </div>
      <GameFrame slug={slug} title={game.title} rom={game.rom} scoring={game.scoring ?? "points"} signedIn={session !== null} />
      <div className="playerFoot">
        <p className="controls">
          Instructions: {game.controls}
          {game.rom ? ". On a phone, use the D-pad and buttons under the screen." : ""}
        </p>
        {!session && (
          <p className="controls">Sign in with 𝕏 after your run to save your score.</p>
        )}
      </div>
      {game.draft && <DraftPanel slug={slug} />}
      {!game.draft && (
      <section id="remix" className="remixPanel">
        <h2>Want to remix {game.title}?</h2>
        <p>
          Say a sentence and a new version ships in about 90 seconds. Try &quot;make the
          paddle tiny and the ball twice as fast&quot;.
        </p>
        {session ? (
          <RemixBox parent={slug} />
        ) : (
          <div className="remixGate">
            <p>Sign in with 𝕏 to remix this game</p>
            <SignInButton variant="nav" />
          </div>
        )}
        <p className="xDrive">
          Or do it from X:{" "}
          {tweetId ? (
            <a href={`https://x.com/suprapan07/status/${tweetId}`}>
              reply to this game&apos;s post
            </a>
          ) : (
            <>reply to this game&apos;s post from @suprapan07</>
          )}{" "}
          with your idea and the pipeline builds it. Mention @suprapan07 with any
          sentence to start a brand new game.
        </p>
      </section>
      )}

      <section className="remixPanel">
        <h2>How this game was built</h2>
        <p>
          No human wrote this bundle. The original Breakout was reverse-engineered
          from a Game Boy ROM into C. Grok patches that source for every ask, GBDK
          compiles it back into a real .gb ROM, a bot plays the build until it
          passes, and the arcade watches WRAM at runtime to detect wins, losses,
          and your clear time.
        </p>
        {hasSource && (
          <p className="sourceLink">
            <a href={`/games/${slug}/source.c`}>view the C source →</a>
          </p>
        )}
        {buildLog && buildLog.stages.length > 0 && (
          <ol className="buildStages buildLogDone">
            {buildLog.stages.map((s, i) => (
              <li key={`${s.name}-${s.at}`} className="stageDone">
                ✓ {s.name}
                <span className="stageTime">
                  {" "}
                  +{((s.at - (i === 0 ? buildLog.startedAt : buildLog.stages[i - 1].at)) / 1000).toFixed(1)}s
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {remixes.length > 0 && (
        <section className="remixPanel">
          <h2>Remixes of {game.title}</h2>
          <ul className="remixList">
            {remixes.map((remix) => (
              <li key={remix.slug} className="remixRow">
                <span className="remixMain">
                  <Link href={`/g/${remix.slug}`} className="remixTitle">
                    {remix.title}
                  </Link>
                  <span className="cardByline">
                    by {remix.creator ? `@${remix.creator}` : "Nova"}
                  </span>
                </span>
                <Link href={`/g/${remix.slug}`} className="playBtn playBtnSm">
                  ▶
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
