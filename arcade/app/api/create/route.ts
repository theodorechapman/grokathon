import { NextRequest, NextResponse } from "next/server";

const REPO = "theodorechapman/grokathon";
const MAX_PROMPT = 300;

function slugify(prompt: string): string {
  const words = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .join("-");
  const suffix = crypto.randomUUID().slice(0, 6);
  return `${words || "game"}-${suffix}`;
}

export async function POST(req: NextRequest) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "job queue not configured" }, { status: 503 });
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
        message: `job: ${prompt.slice(0, 60)}`,
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
