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
      </section>
    </main>
  );
}
