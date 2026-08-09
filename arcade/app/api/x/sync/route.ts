import { NextRequest, NextResponse } from "next/server";
import type { Redis } from "@upstash/redis";
import { redis } from "@/lib/stats";
import { listPublicGames } from "@/lib/games";
import { submitJob } from "@/lib/submit-job";
import { getBotMe, getLikedTweetIds, getMentions, getReplies, postTweet, type Tweet } from "@/lib/x-client";

const SITE = "https://playgrokgames.vercel.app";
const MAX_JOBS_PER_RUN = 5;
// A staged ask waits this long for a like before it's dropped.
const PENDING_TTL_MS = 72 * 3600 * 1000;

// The like is the moderation gate: asks from X stage here and only become
// jobs once @suprapan07 (the bot account) has liked the tweet.
type PendingAsk = { prompt: string; parent: string | null; creator: string; at: string };

async function stageAsk(r: Redis, tweetId: string, ask: PendingAsk): Promise<void> {
  await r.hset("x:pendingjobs", { [tweetId]: JSON.stringify(ask) });
}

async function pendingToJobs(r: Redis, result: SyncResult, budget: { left: number }): Promise<void> {
  const pending = (await r.hgetall<Record<string, string | PendingAsk>>("x:pendingjobs")) ?? {};
  if (Object.keys(pending).length === 0) return;
  const liked = await getLikedTweetIds();
  for (const [tweetId, raw] of Object.entries(pending)) {
    const ask: PendingAsk = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (liked.has(tweetId)) {
      if (budget.left <= 0) continue; // stays staged for the next run
      const jobSlug = await submitJob({
        prompt: ask.prompt,
        parent: ask.parent,
        source: "x",
        creator: ask.creator,
      });
      result.jobs.push(jobSlug);
      budget.left -= 1;
      // The ask lands in the creator's tab immediately, building included.
      await r.sadd(`umade:${ask.creator}`, jobSlug);
      await r.hdel("x:pendingjobs", tweetId);
    } else if (Date.now() - Date.parse(ask.at) > PENDING_TTL_MS) {
      await r.hdel("x:pendingjobs", tweetId);
    }
  }
}

type SyncResult = {
  announced: string[];
  jobs: string[];
  errors: string[];
};

// Tweet ids overflow Number precision and Upstash JSON-parses bare numeric
// strings on read, so ids are stored prefixed ("t<id>") to stay strings.
function packId(id: string): string {
  return `t${id}`;
}

function unpackId(value: unknown): string | null {
  const m = /^t(\d+)$/.exec(String(value ?? ""));
  return m ? m[1] : null;
}

function byIdAscending(a: Tweet, b: Tweet): number {
  return a.id.length === b.id.length ? a.id.localeCompare(b.id) : a.id.length - b.id.length;
}

/** Posts for real when X_POSTING_ENABLED=true, else logs + queues to x:dryrun. */
async function postOrDryRun(r: Redis, text: string, replyToId?: string): Promise<string | null> {
  if (process.env.X_POSTING_ENABLED === "true") {
    return (await postTweet(text, replyToId)).id;
  }
  console.log("[x:dryrun] would post:", text, replyToId ? `(reply to ${replyToId})` : "");
  await r.rpush("x:dryrun", JSON.stringify({ text, replyToId, at: new Date().toISOString() }));
  return null;
}

async function announceNewGames(r: Redis, result: SyncResult): Promise<void> {
  const games = await listPublicGames();
  const posted = new Set(await r.smembers("x:posted"));
  const gameposts = (await r.hgetall<Record<string, string>>("x:gamepost")) ?? {};
  for (const game of games) {
    if (posted.has(game.slug)) continue;
    // Remixes reply into the parent game's announcement thread when we have a
    // real tweet id for the parent (dry-run sentinels unpack to null).
    const parentTweetId = game.parent ? unpackId(gameposts[game.parent]) : null;
    const prefix = game.parent ? "REMIX" : "NEW GAME";
    const text = `${prefix}: ${game.title} — ${game.description} Play it: ${SITE}/g/${game.slug}`;
    const tweetId = await postOrDryRun(r, text, parentTweetId ?? undefined);
    await r.hset("x:gamepost", { [game.slug]: tweetId ? packId(tweetId) : "dryrun" });
    await r.sadd("x:posted", game.slug);
    result.announced.push(game.slug);
  }
}

async function repliesToRemixes(r: Redis, result: SyncResult, budget: { left: number }) {
  const gameposts = (await r.hgetall<Record<string, string>>("x:gamepost")) ?? {};
  const botId = (await getBotMe()).id;
  for (const [slug, packed] of Object.entries(gameposts)) {
    if (budget.left <= 0) return;
    const tweetId = unpackId(packed);
    if (!tweetId) continue; // dry-run sentinel, nothing real to poll
    const sinceId = unpackId(await r.get(`x:lastreply:${slug}`)) ?? undefined;
    const replies = (await getReplies(tweetId, sinceId)).sort(byIdAscending);
    for (const reply of replies) {
      if (budget.left <= 0) break;
      // Bot-authored replies count too (the bot is also the owner's personal
      // account) — but never the bot's own announcements, which always carry
      // the site link. That also keeps thread-reply announcements from
      // spawning job loops.
      // X shortens links to t.co, so a raw URL match misses the bot's own
      // announcements. Match the announcement prefix and any link instead.
      const isOwnAnnouncement =
        reply.author_id === botId &&
        (/^(NEW GAME|REMIX):/.test(reply.text) ||
          reply.text.includes("playgrokgames.vercel.app") ||
          reply.text.includes("t.co/"));
      if (!isOwnAnnouncement && reply.author_handle) {
        await stageAsk(r, reply.id, {
          prompt: reply.text,
          parent: slug,
          creator: reply.author_handle,
          at: new Date().toISOString(),
        });
      }
      await r.set(`x:lastreply:${slug}`, packId(reply.id));
    }
  }
}

async function mentionsToCreations(r: Redis, result: SyncResult, budget: { left: number }) {
  if (budget.left <= 0) return;
  const botId = (await getBotMe()).id;
  const sinceId = unpackId(await r.get("x:lastmention")) ?? undefined;
  const mentions = (await getMentions(sinceId)).sort(byIdAscending);
  for (const mention of mentions) {
    if (budget.left <= 0) break;
    if (mention.author_id !== botId && mention.author_handle) {
      const prompt = mention.text.replace(/^(?:@\w+[\s,]*)+/, "").trim();
      if (prompt.length >= 3) {
        await stageAsk(r, mention.id, {
          prompt,
          parent: null,
          creator: mention.author_handle,
          at: new Date().toISOString(),
        });
      }
    }
    await r.set("x:lastmention", packId(mention.id));
  }
}

export async function POST(req: NextRequest) {
  const syncSecret = process.env.X_SYNC_SECRET;
  if (!syncSecret) {
    return NextResponse.json({ error: "X_SYNC_SECRET not configured" }, { status: 503 });
  }
  if (req.headers.get("x-sync-secret") !== syncSecret) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const r = redis();
  if (!r) {
    return NextResponse.json({ error: "Redis not configured" }, { status: 503 });
  }

  const result: SyncResult = { announced: [], jobs: [], errors: [] };
  const budget = { left: MAX_JOBS_PER_RUN };

  // Steps run independently — one failing must not kill the others.
  const steps: [string, () => Promise<unknown>][] = [
    ["announce", () => announceNewGames(r, result)],
    ["replies", () => repliesToRemixes(r, result, budget)],
    ["mentions", () => mentionsToCreations(r, result, budget)],
    ["pending", () => pendingToJobs(r, result, budget)],
  ];
  for (const [name, step] of steps) {
    try {
      await step();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[x:sync] step "${name}" failed:`, message);
      result.errors.push(`${name}: ${message}`);
    }
  }

  return NextResponse.json(result, { status: result.errors.length ? 207 : 200 });
}
