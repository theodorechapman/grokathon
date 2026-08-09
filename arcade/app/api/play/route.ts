import { NextRequest, NextResponse } from "next/server";
import { clientIp, overLimit, redis, SLUG_RE } from "@/lib/stats";
import { getGame } from "@/lib/games";
import { readSession } from "@/lib/session";
import { resolveAnon, setAnonCookie } from "@/lib/anon";

export async function POST(req: NextRequest) {
  const r = redis();
  if (!r) return NextResponse.json({ error: "stats not configured" }, { status: 503 });

  if (await overLimit(`play:${clientIp(req.headers)}`, 30)) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }

  let body: { slug?: string; anon?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const slug = body.slug ?? "";
  if (!SLUG_RE.test(slug) || !(await getGame(slug))) {
    return NextResponse.json({ error: "unknown game" }, { status: 404 });
  }
  const { id: anonId, isNew } = resolveAnon(req, body.anon);
  const anon = `guest:${anonId}`;
  const plays = await r.incr(`plays:${slug}`);
  const session = await readSession().catch(() => null);
  if (session) {
    await Promise.all([
      r.zincrby("uplays", 1, session.handle),
      r.sadd(`ugames:${session.handle}`, slug),
    ]);
    // One-time merge: fold this device's guest history into the handle.
    if (await r.set(`merged:${anon}`, session.handle, { nx: true, ex: 86400 * 30 })) {
      const guestPlays = (await r.zscore("uplays", anon)) ?? 0;
      if (guestPlays > 0) await r.zincrby("uplays", guestPlays, session.handle);
      await r.zrem("uplays", anon);
      const guestGames = await r.smembers(`ugames:${anon}`);
      if (guestGames.length > 0) {
        await r.sadd(`ugames:${session.handle}`, guestGames[0], ...guestGames.slice(1));
      }
      await r.del(`ugames:${anon}`);
    }
  } else {
    await Promise.all([r.zincrby("uplays", 1, anon), r.sadd(`ugames:${anon}`, slug)]);
  }
  const res = NextResponse.json({ plays });
  if (isNew) setAnonCookie(res, anonId);
  return res;
}
