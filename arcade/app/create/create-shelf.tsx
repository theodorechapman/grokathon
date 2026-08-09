"use client";

// The create shelf: games as marketplace-style cards. Building games sit on
// top with the live grok terminal; shipped games open their build log in a
// fullscreen modal.
import { useEffect, useState } from "react";
import Link from "next/link";
import { myGameSlugs } from "@/lib/my-games";
import { toTerminalLines } from "@/lib/build-log";
import { BuildTerminal, type StageMark } from "../build-terminal";
import { BuildLogModal } from "../build-log-modal";

export type ShelfGame = {
  slug: string;
  title: string;
  creator: string | null;
  hasCover: boolean;
  hasBuild: boolean;
};

type LiveBuild = {
  slug: string;
  stage: string;
  detail?: string;
  stages: StageMark[];
  log?: string[];
};

function LiveCard({ slug }: { slug: string }) {
  const [status, setStatus] = useState<LiveBuild | null>(null);

  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/job-status?slug=${slug}&log=1`, { cache: "no-store" });
        if (res.ok) setStatus((await res.json()) as LiveBuild);
      } catch {}
    }, 2500);
    return () => clearInterval(poll);
  }, [slug]);

  return (
    <div className="createLive">
      <p className="createLiveHead">
        <span className="termDot termDotLive" />
        <Link href={`/g/${slug}`}>{slug}</Link>
        <span className="liveBuildStage">{status?.stage ?? "queued"}</span>
      </p>
      <BuildTerminal
        stages={status?.stages ?? []}
        currentStage={status?.stage ?? "queued"}
        lines={toTerminalLines(status?.log ?? [])}
        live
      />
    </div>
  );
}

function GameCard({ game, mine }: { game: ShelfGame; mine: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="createCard">
      <Link href={`/g/${game.slug}`} className="createCardTop">
        {game.hasCover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/games/${game.slug}/cover.png`} alt="" className="createCover" />
        )}
        <span className="createCardName">
          {game.title}
          {mine && <span className="guestChip">yours</span>}
        </span>
        <span className="cardByline">by {game.creator ? `@${game.creator}` : "Nova"}</span>
      </Link>
      <div className="createCardActions">
        <Link href={`/g/${game.slug}`} className="playBtn playBtnSm">
          ▶
        </Link>
        {game.hasBuild && (
          <button className="buildReplayBtn" onClick={() => setOpen(true)}>
            build log
          </button>
        )}
      </div>
      {open && <BuildLogModal slug={game.slug} title={game.title} onClose={() => setOpen(false)} />}
    </div>
  );
}

export function CreateShelf({ games }: { games: ShelfGame[] }) {
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [building, setBuilding] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    fetch("/api/my-games", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { slugs: [] }))
      .then((data: { slugs?: string[] }) => {
        if (alive) setMine(new Set([...(data.slugs ?? []), ...myGameSlugs()]));
      })
      .catch(() => {});
    const poll = async () => {
      try {
        const res = await fetch("/api/job-status?active=1", { cache: "no-store" });
        if (res.ok && alive) {
          const data = (await res.json()) as { builds: { slug: string }[] };
          setBuilding(data.builds.map((b) => b.slug));
        }
      } catch {}
    };
    poll();
    const timer = setInterval(poll, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const shipped = new Set(games.map((g) => g.slug));
  const inFlight = building.filter((slug) => !shipped.has(slug));
  const sorted = [...games].sort(
    (a, b) => Number(mine.has(b.slug)) - Number(mine.has(a.slug)),
  );

  return (
    <>
      {inFlight.map((slug) => (
        <LiveCard key={slug} slug={slug} />
      ))}
      <div className="createGrid">
        {sorted.map((game) => (
          <GameCard key={game.slug} game={game} mine={mine.has(game.slug)} />
        ))}
      </div>
    </>
  );
}
