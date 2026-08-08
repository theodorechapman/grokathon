import { Redis } from "@upstash/redis";

export type GameStats = { votes: number; plays: number };

let client: Redis | null = null;

export function redis(): Redis | null {
  if (client) return client;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  client = new Redis({ url, token });
  return client;
}

export const SLUG_RE = /^[a-z0-9-]{1,60}$/;

export async function statsFor(slugs: string[]): Promise<Map<string, GameStats>> {
  const out = new Map<string, GameStats>();
  const r = redis();
  if (!r || slugs.length === 0) {
    slugs.forEach((s) => out.set(s, { votes: 0, plays: 0 }));
    return out;
  }
  const keys = slugs.flatMap((s) => [`votes:${s}`, `plays:${s}`]);
  const values = await r.mget<(number | null)[]>(...keys);
  slugs.forEach((s, i) => {
    out.set(s, { votes: values[i * 2] ?? 0, plays: values[i * 2 + 1] ?? 0 });
  });
  return out;
}

export function rankScore(s: GameStats): number {
  return s.votes * 3 + s.plays;
}

export async function overLimit(key: string, limit: number, windowSec = 60): Promise<boolean> {
  const r = redis();
  if (!r) return false;
  const count = await r.incr(`rl:${key}`);
  if (count === 1) await r.expire(`rl:${key}`, windowSec);
  return count > limit;
}

export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export type ScoreRow = { handle: string; score: number };

export async function topScores(slug: string, n = 5): Promise<ScoreRow[]> {
  const r = redis();
  if (!r) return [];
  const raw = await r.zrange<(string | number)[]>(`hs:${slug}`, 0, n - 1, {
    rev: true,
    withScores: true,
  });
  const rows: ScoreRow[] = [];
  for (let i = 0; i < raw.length; i += 2) {
    rows.push({ handle: String(raw[i]), score: Number(raw[i + 1]) });
  }
  return rows;
}
