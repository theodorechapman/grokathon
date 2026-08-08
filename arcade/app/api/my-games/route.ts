import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { redis } from "@/lib/stats";

export const dynamic = "force-dynamic";

const NO_STORE = { headers: { "Cache-Control": "no-store" } };

export async function GET() {
  const session = await readSession().catch(() => null);
  if (!session) return NextResponse.json({ slugs: [] }, NO_STORE);

  const r = redis();
  if (!r) return NextResponse.json({ slugs: [] }, NO_STORE);

  const slugs = await r.smembers(`umade:${session.handle}`);
  return NextResponse.json({ slugs }, NO_STORE);
}
