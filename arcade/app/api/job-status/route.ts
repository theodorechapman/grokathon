import { NextRequest, NextResponse } from "next/server";
import { redis, SLUG_RE } from "@/lib/stats";

export type JobStatus = {
  slug: string;
  stage: string;
  detail?: string;
  stages: { name: string; at: number }[];
  startedAt: number;
};

export async function POST(req: NextRequest) {
  const r = redis();
  if (!r) return NextResponse.json({ error: "not configured" }, { status: 503 });
  if (req.headers.get("x-runner-secret") !== process.env.X_SYNC_SECRET) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  let body: { slug?: string; stage?: string; detail?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const slug = body.slug ?? "";
  if (!SLUG_RE.test(slug) || !body.stage) {
    return NextResponse.json({ error: "slug and stage required" }, { status: 400 });
  }
  const key = `jobstatus:${slug}`;
  const existing = await r.get<JobStatus>(key);
  const now = Date.now();
  const status: JobStatus = existing ?? { slug, stage: "", stages: [], startedAt: now };
  status.stage = body.stage;
  status.detail = body.detail;
  status.stages.push({ name: body.stage, at: now });
  await r.set(key, status, { ex: 3600 });
  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  const r = redis();
  if (!r) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const slug = req.nextUrl.searchParams.get("slug") ?? "";
  if (!SLUG_RE.test(slug)) {
    return NextResponse.json({ error: "bad slug" }, { status: 400 });
  }
  const status = await r.get<JobStatus>(`jobstatus:${slug}`);
  return NextResponse.json(status ?? { slug, stage: "queued", stages: [], startedAt: 0 });
}
