import { NextRequest, NextResponse } from "next/server";
import { clientIp, overLimit, redis, SLUG_RE, topScores } from "@/lib/stats";
import { getGame } from "@/lib/games";
import { readSession } from "@/lib/session";

const MAX_SCORE = 1_000_000_000;
// Anything under 10s on a time board is not a human run.
const MIN_TIME_MS = 10_000;

// Rank preview for the end screen: where would this run land on the board?
// Read-only, works signed out — it's the sign-in bait.
export async function GET(req: NextRequest) {
  const r = redis();
  if (!r) return NextResponse.json({ error: "scores not configured" }, { status: 503 });
  const slug = req.nextUrl.searchParams.get("slug") ?? "";
  const score = Number(req.nextUrl.searchParams.get("score"));
  const game = SLUG_RE.test(slug) ? await getGame(slug) : null;
  if (!game) return NextResponse.json({ error: "unknown game" }, { status: 404 });
  if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE) {
    return NextResponse.json({ error: "invalid score" }, { status: 400 });
  }
  const isTime = game.scoring === "time";
  const s = Math.floor(score);
  const [better, total, top] = await Promise.all([
    isTime ? r.zcount(`hs:${slug}`, "-inf", `(${s}`) : r.zcount(`hs:${slug}`, `(${s}`, "+inf"),
    r.zcard(`hs:${slug}`),
    topScores(slug, 10, isTime),
  ]);
  return NextResponse.json({ rank: better + 1, total, top });
}

export async function POST(req: NextRequest) {
  const r = redis();
  if (!r) return NextResponse.json({ error: "scores not configured" }, { status: 503 });

  const session = await readSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "sign in to claim your score" }, { status: 401 });
  }

  const ip = clientIp(req.headers);
  if (
    (await overLimit(`score:${ip}`, 20)) ||
    (await overLimit(`score:h:${session.handle}`, 20))
  ) {
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
  const min = isTime ? MIN_TIME_MS : 0;
  if (typeof score !== "number" || !Number.isFinite(score) || score < min || score > MAX_SCORE) {
    return NextResponse.json({ error: "invalid score" }, { status: 400 });
  }

  await r.zadd(
    `hs:${slug}`,
    isTime ? { lt: true } : { gt: true },
    { score: Math.floor(score), member: session.handle }
  );
  const best = await r.zscore(`hs:${slug}`, session.handle);
  // Board-topping runs go to a review log so prize payouts can be checked by
  // hand: LRANGE review:scores 0 -1.
  const rank = isTime
    ? await r.zrank(`hs:${slug}`, session.handle)
    : await r.zrevrank(`hs:${slug}`, session.handle);
  if (rank === 0 && best === Math.floor(score)) {
    await r.lpush(
      "review:scores",
      JSON.stringify({ slug, handle: session.handle, score: Math.floor(score), ip, at: new Date().toISOString() })
    );
    await r.ltrim("review:scores", 0, 499);
  }
  return NextResponse.json({ saved: true, handle: session.handle, best });
}
