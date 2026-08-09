import { access } from "fs/promises";
import path from "path";
import { listPublicGames } from "@/lib/games";
import { SiteNav } from "../site-nav";
import { CreateShelf, type ShelfGame } from "./create-shelf";

export const dynamic = "force-dynamic";

const X_INTENT = `https://x.com/intent/post?text=${encodeURIComponent(
  "@suprapan07 make me a game: "
)}`;

export default async function CreatePage() {
  const games = await listPublicGames();
  const shelf: ShelfGame[] = await Promise.all(
    games.map(async (g) => ({
      slug: g.slug,
      title: g.title,
      creator: g.creator ?? null,
      hasCover: g.hasCover,
      hasBuild: await access(path.join(process.cwd(), "public", "games", g.slug, "build-log.ndjson"))
        .then(() => true)
        .catch(() => false),
    })),
  );

  return (
    <main>
      <SiteNav active="create" />
      <section className="createHero">
        <h1>Say a game.</h1>
        <p>
          Post your idea on X and Grok builds it into a real Game Boy ROM you
          can play and share. Reply to any game&apos;s thread to remix it.
        </p>
        <a className="xCta" href={X_INTENT} target="_blank" rel="noopener noreferrer">
          𝕏 Post your game idea
        </a>
      </section>
      <CreateShelf games={shelf} />
    </main>
  );
}
