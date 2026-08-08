import { Redis } from "@upstash/redis";
import { redis } from "@/lib/stats";

const API = "https://api.x.com/2";
const TOKEN_KEY = "x:bot:token";
const ME_KEY = "x:bot:me";
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export type BotToken = {
  access_token: string;
  refresh_token: string;
  expires_at: number; // epoch ms
};

export type BotMe = { id: string; handle: string };

export type Tweet = {
  id: string;
  text: string;
  author_id: string;
  author_handle: string;
  conversation_id?: string;
};

function requireRedis(): Redis {
  const r = redis();
  if (!r) throw new Error("Redis not configured (KV_REST_API_URL/KV_REST_API_TOKEN)");
  return r;
}

function clientCreds(): { id: string; secret: string } {
  const id = process.env.X_CLIENT_ID;
  const secret = process.env.X_CLIENT_SECRET;
  if (!id || !secret) throw new Error("X_CLIENT_ID/X_CLIENT_SECRET unset");
  return { id, secret };
}

async function refreshToken(r: Redis, token: BotToken): Promise<BotToken> {
  const { id, secret } = clientCreds();
  const res = await fetch(`${API}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: token.refresh_token,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`X token refresh failed: ${res.status} ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  const next: BotToken = {
    access_token: data.access_token,
    // X rotates refresh tokens — persist the new one or the old one dies.
    refresh_token: data.refresh_token ?? token.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
  await r.set(TOKEN_KEY, next);
  return next;
}

async function accessToken(): Promise<string> {
  const r = requireRedis();
  let token = await r.get<BotToken>(TOKEN_KEY);
  if (!token) throw new Error("no bot token in Redis (run /api/x/authorize once)");
  if (Date.now() > token.expires_at - REFRESH_MARGIN_MS) {
    token = await refreshToken(r, token);
  }
  return token.access_token;
}

async function xGet(path: string, params: Record<string, string>): Promise<unknown> {
  const token = await accessToken();
  const url = `${API}${path}?${new URLSearchParams(params)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`X GET ${path} failed: ${res.status} ${body.slice(0, 300)}`);
  }
  return res.json();
}

type TweetPage = {
  data?: { id: string; text: string; author_id: string; conversation_id?: string }[];
  includes?: { users?: { id: string; username: string }[] };
};

function toTweets(page: TweetPage): Tweet[] {
  const handles = new Map((page.includes?.users ?? []).map((u) => [u.id, u.username]));
  return (page.data ?? []).map((t) => ({
    ...t,
    author_handle: handles.get(t.author_id) ?? "",
  }));
}

export async function getBotMe(): Promise<BotMe> {
  const me = await requireRedis().get<BotMe>(ME_KEY);
  if (!me) throw new Error("no bot identity in Redis (run /api/x/authorize once)");
  return me;
}

export async function postTweet(text: string, replyToId?: string): Promise<{ id: string }> {
  const token = await accessToken();
  const body: Record<string, unknown> = { text };
  if (replyToId) body.reply = { in_reply_to_tweet_id: replyToId };
  const res = await fetch(`${API}/tweets`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`X POST /tweets failed: ${res.status} ${detail.slice(0, 300)}`);
  }
  const data = (await res.json()) as { data: { id: string } };
  return { id: data.data.id };
}

export async function getMentions(sinceId?: string): Promise<Tweet[]> {
  const me = await getBotMe();
  const params: Record<string, string> = {
    "tweet.fields": "author_id,conversation_id,text",
    expansions: "author_id",
    "user.fields": "username",
    max_results: "100",
  };
  if (sinceId) params.since_id = sinceId;
  const page = (await xGet(`/users/${me.id}/mentions`, params)) as TweetPage;
  return toTweets(page);
}

export async function getReplies(conversationId: string, sinceId?: string): Promise<Tweet[]> {
  const params: Record<string, string> = {
    query: `conversation_id:${conversationId}`,
    "tweet.fields": "author_id,conversation_id,text",
    expansions: "author_id",
    "user.fields": "username",
    max_results: "100",
  };
  if (sinceId) params.since_id = sinceId;
  const page = (await xGet("/tweets/search/recent", params)) as TweetPage;
  return toTweets(page);
}
