import { readSession } from "@/lib/session";
import { SiteNav } from "../site-nav";
import { CreateBox } from "../arcade/create-box";

export const dynamic = "force-dynamic";

export default async function CreatePage() {
  const session = await readSession().catch(() => null);
  return (
    <main>
      <SiteNav active="create" />
      <section className="createHero">
        <h1>Say a game.</h1>
        <p>
          Describe it in a sentence. Grok builds it, a bot plays it until it
          passes, and it lands in the arcade as a link anyone can play.
        </p>
        <CreateBox signedIn={session !== null} />
      </section>
    </main>
  );
}
