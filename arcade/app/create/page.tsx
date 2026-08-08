import { readSession } from "@/lib/session";
import { listGames } from "@/lib/games";
import { SiteNav } from "../site-nav";
import { CreateBox } from "../arcade/create-box";
import { SignInButton } from "../sign-in-button";
import { MyCreations } from "../my/my-creations";

export const dynamic = "force-dynamic";

export default async function CreatePage() {
  const session = await readSession().catch(() => null);
  if (!session) {
    return (
      <main>
        <SiteNav active="create" />
        <section className="gate">
          <h1>Creating needs a name on it</h1>
          <p>Sign in and every game you make carries your handle.</p>
          <SignInButton variant="big" />
        </section>
      </main>
    );
  }
  const games = await listGames();
  const titles: Record<string, string> = {};
  for (const g of games) titles[g.slug] = g.title;

  return (
    <main>
      <SiteNav active="create" />
      <section className="createHero">
        <h1>Say a game.</h1>
        <p>
          Describe it in a sentence. Grok builds it, a bot plays it until it
          passes, and it lands in the arcade as a link anyone can play.
        </p>
        <CreateBox signedIn />
        <p className="xDrive">
          No form needed: mention @suprapan07 on X with your sentence and the
          pipeline builds it the same way. Reply to any game&apos;s post to remix
          it instead.
        </p>
      </section>
      <section className="remixPanel">
        <h2>Your games</h2>
        <MyCreations titles={titles} />
      </section>
    </main>
  );
}
