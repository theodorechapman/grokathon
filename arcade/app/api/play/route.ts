import { NextRequest, NextResponse } from "next/server";
import { clientIp, overLimit, redis, SLUG_RE } from "@/lib/stats";
import { getGame } from "@/lib/games";
import { readSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  const r = redis();
  if (!r) return NextResponse.json({ error: "stats not configured" }, { status: 503 });

  if (await overLimit(`play:${clientIp(req.headers)}`, 30)) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }

  let body: { slug?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const slug = body.slug ?? "";
  if (!SLUG_RE.test(slug) || !(await getGame(slug))) {
    return NextResponse.json({ error: "unknown game" }, { status: 404 });
  }
  const plays = await r.incr(`plays:${slug}`);
  const session = await readSession().catch(() => null);
  if (session) {
    await Promise.all([
      r.zincrby("uplays", 1, session.handle),
      r.sadd(`ugames:${session.handle}`, slug),
    ]);
  }
  return NextResponse.json({ plays });
}
