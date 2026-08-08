import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { JobQueueError, SLUG_RE, publishDraft } from "@/lib/submit-job";

/** Creator-only: drops the draft flag from a bundle's manifest, freezing it. */
export async function POST(req: NextRequest) {
  const session = await readSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "sign in to publish" }, { status: 401 });
  }

  let body: { slug?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const slug = body.slug?.trim();
  if (!slug || !SLUG_RE.test(slug)) {
    return NextResponse.json({ error: "invalid slug" }, { status: 400 });
  }

  try {
    await publishDraft(slug, session.handle);
  } catch (err) {
    if (err instanceof JobQueueError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  return NextResponse.json({ slug, status: "published" });
}
