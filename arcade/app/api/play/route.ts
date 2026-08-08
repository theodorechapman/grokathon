import { NextRequest, NextResponse } from "next/server";
import { redis, SLUG_RE } from "@/lib/stats";

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
  if (!SLUG_RE.test(slug)) {
    return NextResponse.json({ error: "unknown game" }, { status: 404 });
  }
  const plays = await r.incr(`plays:${slug}`);
  return NextResponse.json({ plays });
}
