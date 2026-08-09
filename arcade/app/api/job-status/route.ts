import { NextRequest, NextResponse } from "next/server";
import { redis, SLUG_RE } from "@/lib/stats";

export type JobStatus = {
  slug: string;
  stage: string;
  detail?: string;
  stages: { name: string; at: number }[];
  startedAt: number;
  log?: string[];
};

const LOG_CAP = 500;
const LOG_TAIL = 250;
const ACTIVE_WINDOW_MS = 20 * 60 * 1000;

export async function POST(req: NextRequest) {
  const r = redis();
  if (!r) return NextResponse.json({ error: "not configured" }, { status: 503 });
  if (req.headers.get("x-runner-secret") !== process.env.X_SYNC_SECRET) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  let body: { slug?: string; stage?: string; detail?: string; log?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const slug = body.slug ?? "";
  if (!SLUG_RE.test(slug) || (!body.stage && !Array.isArray(body.log))) {
    return NextResponse.json({ error: "slug and stage or log required" }, { status: 400 });
  }
  const now = Date.now();
  if (Array.isArray(body.log) && body.log.length > 0) {
    const lines = body.log.slice(0, 50).map((l) => String(l).slice(0, 600));
    const logKey = `jobstatus:log:${slug}`;
    await r.rpush(logKey, ...lines);
    await r.ltrim(logKey, -LOG_CAP, -1);
    await r.expire(logKey, 3600);
  }
  if (body.stage) {
    const key = `jobstatus:${slug}`;
    const existing = await r.get<JobStatus>(key);
    const status: JobStatus = existing ?? { slug, stage: "", stages: [], startedAt: now };
    status.stage = body.stage;
    status.detail = body.detail;
    status.stages.push({ name: body.stage, at: now });
    await r.set(key, status, { ex: 3600 });
  }
  // Live-build index for the /create glass box.
  await r.zadd("jobstatus:active", { score: now, member: slug });
  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  const r = redis();
  if (!r) return NextResponse.json({ error: "not configured" }, { status: 503 });

  if (req.nextUrl.searchParams.get("active") === "1") {
    const cutoff = Date.now() - ACTIVE_WINDOW_MS;
    const slugs = await r.zrange<string[]>("jobstatus:active", cutoff, "+inf", { byScore: true });
    const statuses = (
      await Promise.all(slugs.slice(0, 6).map((s) => r.get<JobStatus>(`jobstatus:${s}`)))
    ).filter((s): s is JobStatus => s !== null && s.stage !== "published");
    return NextResponse.json({ builds: statuses });
  }

  const slug = req.nextUrl.searchParams.get("slug") ?? "";
  if (!SLUG_RE.test(slug)) {
    return NextResponse.json({ error: "bad slug" }, { status: 400 });
  }
  const status = await r.get<JobStatus>(`jobstatus:${slug}`);
  if (status && req.nextUrl.searchParams.get("log") === "1") {
    status.log = await r.lrange<string>(`jobstatus:log:${slug}`, -LOG_TAIL, -1);
  }
  return NextResponse.json(status ?? { slug, stage: "queued", stages: [], startedAt: 0 });
}
