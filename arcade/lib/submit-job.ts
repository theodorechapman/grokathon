const REPO = "theodorechapman/grokathon";
const MAX_PENDING_JOBS = 30;

export type JobRequest = {
  prompt: string;
  parent?: string | null;
  source: "site" | "x";
  creator?: string | null;
  /** Existing draft slug to iterate in place; the job's slug becomes the target. */
  target?: string | null;
  /** Ship the bundle as an unpublished draft. */
  draft?: boolean;
  /** Tweet id of the originating X ask, for the game's build history. */
  tweet?: string | null;
};

/** Mirrors the runner's SLUG_RE. */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,59}$/;

export class JobQueueError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "JobQueueError";
  }
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

export async function pendingJobCount(token: string): Promise<number> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/pipeline/jobs`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    cache: "no-store",
  });
  if (!res.ok) return 0;
  const entries = (await res.json()) as { name: string }[];
  return entries.filter((e) => e.name.endsWith(".json")).length;
}

/** Commits a job file to pipeline/jobs/<slug>.json via the GitHub contents API. */
export async function submitJob(req: JobRequest): Promise<string> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new JobQueueError("job queue not configured (GITHUB_TOKEN unset)", 503);

  if ((await pendingJobCount(token)) >= MAX_PENDING_JOBS) {
    throw new JobQueueError("the queue is full", 503);
  }

  const slug = req.target ?? slugify(req.prompt);
  const job = {
    id: slug,
    slug,
    prompt: req.prompt,
    parent: req.parent ?? null,
    requestedAt: new Date().toISOString(),
    source: req.source,
    creator: req.creator ?? null,
    ...(req.target ? { target: req.target } : {}),
    ...(req.draft ? { draft: true } : {}),
    ...(req.tweet ? { tweet: req.tweet } : {}),
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
      body: JSON.stringify({ message: `job: ${commitSafe(req.prompt)}`, content }),
    }
  );

  if (!res.ok) {
    // 422 without a sha means the file already exists: a target job is already
    // queued for this draft. One pending iteration at a time.
    if (res.status === 422 && req.target) {
      throw new JobQueueError("an iteration is already queued for this draft", 409);
    }
    const detail = await res.text();
    throw new JobQueueError(
      `job commit failed: ${res.status} ${detail.slice(0, 300)}`,
      502
    );
  }
  return slug;
}

/**
 * Publishes a draft: drops the `draft` flag from the bundle's manifest via the
 * GitHub contents API (same write path submitJob uses). Throws JobQueueError
 * with 404 (no draft), 403 (not the creator), or 409 (already published).
 */
export async function publishDraft(slug: string, handle: string): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new JobQueueError("publish not configured (GITHUB_TOKEN unset)", 503);

  const filePath = `arcade/public/games/${slug}/manifest.json`;
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" };
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${filePath}`, {
    headers,
    cache: "no-store",
  });
  if (!res.ok) throw new JobQueueError("draft not found", 404);
  const file = (await res.json()) as { content: string; sha: string };
  const manifest = JSON.parse(Buffer.from(file.content, "base64").toString()) as Record<
    string,
    unknown
  >;
  if (manifest.creator !== handle) throw new JobQueueError("only the creator can publish", 403);
  if (manifest.draft !== true) throw new JobQueueError("already published", 409);
  delete manifest.draft;

  const content = Buffer.from(JSON.stringify(manifest, null, 2) + "\n").toString("base64");
  const put = await fetch(`https://api.github.com/repos/${REPO}/contents/${filePath}`, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ message: `publish: ${slug}`, content, sha: file.sha }),
  });
  if (!put.ok) {
    const detail = await put.text();
    throw new JobQueueError(`publish failed: ${put.status} ${detail.slice(0, 300)}`, 502);
  }
}
