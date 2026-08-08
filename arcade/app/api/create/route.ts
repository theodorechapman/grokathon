import { NextRequest, NextResponse } from "next/server";
import { overLimit, redis } from "@/lib/stats";
import { readSession } from "@/lib/session";
import { JobQueueError, submitJob } from "@/lib/submit-job";

const MAX_PROMPT = 300;
const RATE_LIMIT_PER_MIN = 5;

const hits = new Map<string, number[]>();

async function rateLimited(ip: string): Promise<boolean> {
  const r = redis();
  if (r) {
    const key = `rl:create:${ip}`;
    const count = await r.incr(key);
    if (count === 1) await r.expire(key, 60);
    return count > RATE_LIMIT_PER_MIN;
  }
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE_LIMIT_PER_MIN;
}

export async function POST(req: NextRequest) {
  if (!process.env.GITHUB_TOKEN) {
    return NextResponse.json({ error: "job queue not configured" }, { status: 503 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (await rateLimited(ip)) {
    return NextResponse.json({ error: "slow down, one game a minute is plenty" }, { status: 429 });
  }
  if (await overLimit("create:global", 20)) {
    return NextResponse.json({ error: "the arcade is busy, try again in a minute" }, { status: 429 });
  }

  let body: { prompt?: string; parent?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const prompt = body.prompt?.trim();
  if (!prompt || prompt.length < 3 || prompt.length > MAX_PROMPT) {
    return NextResponse.json(
      { error: `prompt must be 3-${MAX_PROMPT} characters` },
      { status: 400 }
    );
  }

  const session = await readSession().catch(() => null);
  let slug: string;
  try {
    slug = await submitJob({
      prompt,
      parent: body.parent ?? null,
      source: "site",
      creator: session?.handle ?? null,
    });
  } catch (err) {
    if (err instanceof JobQueueError) {
      console.error("job submit failed", err.status, err.message);
      const friendly =
        err.status === 503 ? "the queue is full, try again in a few minutes" : "failed to queue job";
      return NextResponse.json({ error: friendly }, { status: err.status });
    }
    throw err;
  }

  if (session) {
    const r = redis();
    if (r) {
      try {
        await r.sadd(`umade:${session.handle}`, slug);
      } catch (err) {
        // job already committed above, so surface the failure without failing the request
        console.error("umade sadd failed", session.handle, slug, err);
      }
    }
  }

  return NextResponse.json({ slug, status: "queued" }, { status: 202 });
}
