"use client";

// How this game got made: one line of provenance from build.json plus a
// button that opens the full agent log in the fullscreen modal.
import { useEffect, useState } from "react";
import type { BuildRecord } from "@/lib/build-log";
import { BuildLogModal } from "../../build-log-modal";

export function BuildHistory({ slug, title }: { slug: string; title?: string }) {
  const [record, setRecord] = useState<BuildRecord | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch(`/games/${slug}/build.json`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setRecord)
      .catch(() => setRecord(null));
  }, [slug]);

  if (!record) return null;

  const first = record.stages[0]?.at;
  const total =
    first && !record.audit ? Math.round((Date.parse(record.finishedAt) - Date.parse(first)) / 1000) : null;

  return (
    <div className="buildHistory">
      <p className="buildMeta">
        {record.audit ? (
          <>Shipped before build logs existed, then re-verified by the Grok Build CLI in a Vercel Sandbox microVM: recompile, ROM compare, contract check.</>
        ) : record.engine === "sandbox" ? (
          <>Built by the Grok Build CLI in a Vercel Sandbox microVM{total !== null && <> in {total}s</>}.</>
        ) : (
          <>Built by Grok on the Nova pipeline{total !== null && <> in {total}s</>}.</>
        )}
        {record.job.prompt && (
          <>
            {" "}
            The ask: <em>&ldquo;{record.job.prompt}&rdquo;</em>
            {record.job.creator ? ` — @${record.job.creator}` : ""}
          </>
        )}
        {record.job.tweet && (
          <>
            {" "}
            <a
              href={`https://x.com/i/web/status/${record.job.tweet}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              𝕏 the original ask
            </a>
          </>
        )}
      </p>
      <button className="buildReplayBtn" onClick={() => setOpen(true)}>
        Watch how it was built
      </button>
      {open && <BuildLogModal slug={slug} title={title ?? slug} onClose={() => setOpen(false)} />}
    </div>
  );
}
