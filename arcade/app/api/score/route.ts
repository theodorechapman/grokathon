import { NextRequest, NextResponse } from "next/server";
import { clientIp, overLimit, redis, SLUG_RE } from "@/lib/stats";
import { getGame } from "@/lib/games";
import { readSession } from "@/lib/session";

const MAX_SCORE = 1_000_000_000;

export async function POST(req: NextRequest) {
  const r = redis();
  if (!r) return NextResponse.json({ error: "scores not configured" }, { status: 503 });

  const session = await readSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "sign in to claim your score" }, { status: 401 });
  }

  if (await overLimit(`score:${clientIp(req.headers)}`, 20)) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }

  let body: { slug?: string; score?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const slug = body.slug ?? "";
  const score = body.score;
  const game = SLUG_RE.test(slug) ? await getGame(slug) : null;
  if (!game) {
    return NextResponse.json({ error: "unknown game" }, { status: 404 });
  }
  const isTime = game.scoring === "time";
  const min = isTime ? 1 : 0;
  if (typeof score !== "number" || !Number.isFinite(score) || score < min || score > MAX_SCORE) {
    return NextResponse.json({ error: "invalid score" }, { status: 400 });
  }

  await r.zadd(
    `hs:${slug}`,
    isTime ? { lt: true } : { gt: true },
    { score: Math.floor(score), member: session.handle }
  );
  const best = await r.zscore(`hs:${slug}`, session.handle);
  return NextResponse.json({ saved: true, handle: session.handle, best });
}
