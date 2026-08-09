import { NextRequest, NextResponse } from "next/server";
import { clientIp, overLimit, redis, SLUG_RE } from "@/lib/stats";
import { getGame } from "@/lib/games";

// Anonymous per-run outcome tally. Wins vs losses per game is the completion
// signal that tells us which games are too hard, too easy, or worth iterating.
export async function POST(req: NextRequest) {
  const r = redis();
  if (!r) return NextResponse.json({ error: "stats not configured" }, { status: 503 });

  if (await overLimit(`outcome:${clientIp(req.headers)}`, 30)) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }

  let body: { slug?: string; outcome?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const slug = body.slug ?? "";
  const outcome = body.outcome === "win" ? "win" : body.outcome === "loss" ? "loss" : null;
  if (!outcome || !SLUG_RE.test(slug) || !(await getGame(slug))) {
    return NextResponse.json({ error: "unknown game" }, { status: 404 });
  }
  await r.hincrby(`outcomes:${slug}`, outcome, 1);
  return NextResponse.json({ ok: true });
}
