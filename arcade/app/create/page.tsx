import { readSession } from "@/lib/session";
import { listGames } from "@/lib/games";
import { SiteNav } from "../site-nav";
import { CreateBox } from "../arcade/create-box";
import { SignInButton } from "../sign-in-button";
import { MyCreations } from "../my/my-creations";

export const dynamic = "force-dynamic";

const X_INTENT = `https://x.com/intent/post?text=${encodeURIComponent(
  "@suprapan07 make me a game: "
)}`;

export default async function CreatePage() {
  const session = await readSession().catch(() => null);
  const games = session ? await listGames() : [];
  const titles: Record<string, string> = {};
  for (const g of games) titles[g.slug] = g.title;

  return (
    <main>
      <SiteNav active="create" />
      <section className="createHero">
        <h1>Say a game.</h1>
        <p>
          Post your idea on X. Grok builds it, a bot plays it until it passes,
          and it lands in the arcade as a link anyone can play, announced in
          the thread. Reply to any game&apos;s post to remix it instead.
        </p>
        <a className="xCta" href={X_INTENT} target="_blank" rel="noopener noreferrer">
          𝕏 Post your game idea
        </a>
        {session ? (
          <>
            <p className="xDrive">Or build it from here instead:</p>
            <CreateBox signedIn />
          </>
        ) : (
          <p className="xDrive">
            Building from the site instead needs a name on it.{" "}
            <SignInButton variant="nav" />
          </p>
        )}
      </section>
      {session && (
        <section className="remixPanel">
          <h2>Your games</h2>
          <MyCreations titles={titles} />
        </section>
      )}
    </main>
  );
}
