const REPO = "theodorechapman/grokathon";
const MAX_PENDING_JOBS = 30;

export type JobRequest = {
  prompt: string;
  parent?: string | null;
  source: "site" | "x";
  creator?: string | null;
};

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

  const slug = slugify(req.prompt);
  const job = {
    id: slug,
    slug,
    prompt: req.prompt,
    parent: req.parent ?? null,
    requestedAt: new Date().toISOString(),
    source: req.source,
    creator: req.creator ?? null,
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
    const detail = await res.text();
    throw new JobQueueError(
      `job commit failed: ${res.status} ${detail.slice(0, 300)}`,
      502
    );
  }
  return slug;
}
