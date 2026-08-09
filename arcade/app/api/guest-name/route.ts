import { NextRequest, NextResponse } from "next/server";
import { clientIp, overLimit, redis } from "@/lib/stats";
import { validGuestName } from "@/lib/guest-name";

export async function POST(req: NextRequest) {
  const r = redis();
  if (!r) return NextResponse.json({ error: "not configured" }, { status: 503 });
  if (await overLimit(`gname:${clientIp(req.headers)}`, 5)) {
    return NextResponse.json({ error: "slow down" }, { status: 429 });
  }

  let body: { anon?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const anon = body.anon ?? "";
  const name = (body.name ?? "").trim();
  if (!/^[0-9a-f]{32}$/.test(anon)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }
  if (!validGuestName(name)) {
    return NextResponse.json(
      { error: "3-16 letters, numbers, spaces or dashes" },
      { status: 400 }
    );
  }
  await r.hset("guest:names", { [`guest:${anon}`]: name });
  return NextResponse.json({ ok: true, name });
}
