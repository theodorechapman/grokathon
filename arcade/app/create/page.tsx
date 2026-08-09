import { readdir, readFile } from "fs/promises";
import path from "path";
import Link from "next/link";
import { readSession } from "@/lib/session";
import { listGames, listPublicGames } from "@/lib/games";
import type { BuildRecord } from "@/lib/build-log";
import { SiteNav } from "../site-nav";
import { MyCreations } from "../my/my-creations";
import { LiveBuilds } from "./live-builds";

export const dynamic = "force-dynamic";

const X_INTENT = `https://x.com/intent/post?text=${encodeURIComponent(
  "@suprapan07 make me a game: "
)}`;

const PIPELINE = [
  { name: "microVM up", detail: "a fresh Vercel Sandbox boots with GBDK and the Grok Build CLI" },
  { name: "grok build", detail: "the agent rewrites real reverse-engineered Game Boy C for your ask" },
  { name: "compile", detail: "GBDK's lcc builds a real 32KB .gb ROM, retried until it's clean" },
  { name: "ship", detail: "the bundle publishes to the arcade and the thread gets the link" },
];

async function recentBuilds(): Promise<{ slug: string; title: string; record: BuildRecord }[]> {
  const root = path.join(process.cwd(), "public", "games");
  const games = await listPublicGames();
  const titles = new Map(games.map((g) => [g.slug, g.title]));
  const out: { slug: string; title: string; record: BuildRecord }[] = [];
  for (const slug of await readdir(root).catch(() => [] as string[])) {
    if (!titles.has(slug)) continue; // drafts and non-games stay out
    try {
      const record = JSON.parse(
        await readFile(path.join(root, slug, "build.json"), "utf8"),
      ) as BuildRecord;
      out.push({ slug, title: titles.get(slug) ?? slug, record });
    } catch {}
  }
  return out
    .sort((a, b) => Date.parse(b.record.finishedAt) - Date.parse(a.record.finishedAt))
    .slice(0, 5);
}

export default async function CreatePage() {
  const session = await readSession().catch(() => null);
  const games = session ? await listGames() : [];
  const titles: Record<string, string> = {};
  for (const g of games) titles[g.slug] = g.title;
  const recent = await recentBuilds();

  return (
    <main>
      <SiteNav active="create" />
      <section className="createHero">
        <h1>Say a game.</h1>
        <p>
          Post your idea on X. A real coding agent builds it in a real microVM,
          and it lands in the arcade as a link anyone can play, announced in the
          thread. Reply to any game&apos;s post to remix it instead.
        </p>
        <a className="xCta" href={X_INTENT} target="_blank" rel="noopener noreferrer">
          𝕏 Post your game idea
        </a>
      </section>

      <section className="remixPanel">
        <h2>Building now</h2>
        <LiveBuilds />
      </section>

      <section className="remixPanel">
        <h2>What your ask kicks off</h2>
        <ol className="pipelineStrip">
          {PIPELINE.map((s) => (
            <li key={s.name}>
              <span className="pipeName">{s.name}</span>
              <span className="pipeDetail">{s.detail}</span>
            </li>
          ))}
        </ol>
        <p className="xDrive">
          No canned templates: every game is C source compiled to a Game Boy
          ROM, and every build&apos;s full agent log is public on its game page.
        </p>
      </section>

      {recent.length > 0 && (
        <section className="remixPanel">
          <h2>Fresh from the pipeline</h2>
          <ul className="remixList">
            {recent.map(({ slug, title, record }) => (
              <li key={slug} className="remixRow">
                <span className="remixMain">
                  <Link href={`/g/${slug}`} className="remixTitle">
                    {title}
                  </Link>
                  <span className="cardByline">
                    {record.job.prompt ? `“${record.job.prompt.slice(0, 80)}”` : ""}
                    {record.job.creator ? ` — @${record.job.creator}` : ""}
                  </span>
                </span>
                <Link href={`/g/${slug}`} className="playBtn playBtnSm">
                  ▶
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {session && (
        <section className="remixPanel">
          <h2>Your games</h2>
          <MyCreations titles={titles} />
        </section>
      )}
    </main>
  );
}
