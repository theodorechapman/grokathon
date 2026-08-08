const REPO = "theodorechapman/grokathon";

export type PendingJob = { slug: string; prompt: string; status: string };

export async function pendingJob(slug: string): Promise<PendingJob | null> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/contents/pipeline/jobs/${slug}.json`,
    {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.raw+json" },
      cache: "no-store",
    }
  );
  if (!res.ok) return null;
  const job = (await res.json()) as { slug?: string; prompt?: string; status?: string };
  if (job.slug !== slug) return null;
  return { slug, prompt: job.prompt ?? "", status: job.status ?? "building" };
}
