import { NextRequest, NextResponse } from "next/server";
import { overLimit, redis } from "@/lib/stats";

const REPO = "theodorechapman/grokathon";
const MAX_PROMPT = 300;
const MAX_PENDING_JOBS = 30;
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

function slugify(prompt: string): string {
  const words = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .join("-")
    .slice(0, 48);
  const suffix = crypto.randomUUID().slice(0, 6);
  return `${words || "game"}-${suffix}`;
}

function commitSafe(prompt: string): string {
  return prompt.replace(/[\r\n\t]+/g, " ").replace(/[^\x20-\x7e]/g, "").slice(0, 60);
}

async function pendingJobCount(token: string): Promise<number> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/pipeline/jobs`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    cache: "no-store",
  });
  if (!res.ok) return 0;
  const entries = (await res.json()) as { name: string }[];
  return entries.filter((e) => e.name.endsWith(".json")).length;
}

export async function POST(req: NextRequest) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
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

  if ((await pendingJobCount(token)) >= MAX_PENDING_JOBS) {
    return NextResponse.json(
      { error: "the queue is full, try again in a few minutes" },
      { status: 503 }
    );
  }

  const slug = slugify(prompt);
  const job = {
    id: slug,
    slug,
    prompt,
    parent: body.parent ?? null,
    requestedAt: new Date().toISOString(),
    source: "site",
  };

  const content = Buffer.from(JSON.stringify(job, null, 2)).toString("base64");
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/contents/pipeline/jobs/${slug}.json`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: `job: ${commitSafe(prompt)}`,
        content,
      }),
    }
  );

  if (!res.ok) {
    const detail = await res.text();
    console.error("job commit failed", res.status, detail.slice(0, 300));
    return NextResponse.json({ error: "failed to queue job" }, { status: 502 });
  }

  return NextResponse.json({ slug, status: "queued" }, { status: 202 });
}
