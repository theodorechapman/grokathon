import { listGames } from "@/lib/games";
import { readSession } from "@/lib/session";
import { SiteNav } from "../site-nav";
import { SignInButton } from "../sign-in-button";
import { MyCreations } from "./my-creations";

export const dynamic = "force-dynamic";

export default async function MyPage() {
  const session = await readSession().catch(() => null);
  const games = await listGames();
  const titles: Record<string, string> = {};
  for (const g of games) titles[g.slug] = g.title;

  return (
    <main>
      <SiteNav active="my" />
      <header className="masthead" style={{ marginTop: 8 }}>
        <h1>My games</h1>
        <p>
          Everything you&apos;ve made or remixed — still-building jobs included.
        </p>
      </header>
      {!session && (
        <div className="boardGate">
          <span>
            These are creations from this device. Sign in with 𝕏 to claim them
            under your handle.
          </span>
          <SignInButton variant="nav" />
        </div>
      )}
      <MyCreations titles={titles} />
    </main>
  );
}
