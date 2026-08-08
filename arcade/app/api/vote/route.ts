import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { redis, SLUG_RE } from "@/lib/stats";
import { getGame } from "@/lib/games";

export async function POST(req: NextRequest) {
  const r = redis();
  if (!r) return NextResponse.json({ error: "stats not configured" }, { status: 503 });

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

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const voter = createHash("sha256").update(ip).digest("hex").slice(0, 16);

  const isNew = await r.sadd(`voters:${slug}`, voter);
  if (isNew === 1) await r.incr(`votes:${slug}`);
  const votes = (await r.get<number>(`votes:${slug}`)) ?? 0;
  return NextResponse.json({ votes, counted: isNew === 1 });
}
