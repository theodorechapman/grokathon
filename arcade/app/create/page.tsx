import { readSession } from "@/lib/session";
import { SiteNav } from "../site-nav";
import { CreateBox } from "../arcade/create-box";
import { SignInButton } from "../sign-in-button";

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
    </main>
  );
}
