import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/stats";
import type { BotMe, BotToken } from "@/lib/x-client";

const CALLBACK_URI = "https://playgrokgames.vercel.app/api/x/authorize/callback";

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

/** Completes the one-time admin flow: exchanges the code, stores the bot token + identity. */
export async function GET(req: NextRequest) {
  const adminSecret = process.env.X_ADMIN_SECRET;
  if (!adminSecret) {
    return NextResponse.json({ error: "X_ADMIN_SECRET not configured" }, { status: 503 });
  }
  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "X client creds not configured" }, { status: 503 });
  }
  const r = redis();
  if (!r) {
    return NextResponse.json({ error: "Redis not configured" }, { status: 503 });
  }

  // X redirects here with only code+state, so the admin secret can't ride the
  // query string. The state is a one-time Redis record minted only by the
  // secret-guarded /api/x/authorize route; an unknown state gets 403.
  const params = req.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) {
    return NextResponse.json({ error: "missing code or state" }, { status: 403 });
  }
  const verifier = await r.get<string>(`x:oauth:state:${state}`);
  if (!verifier) {
    return NextResponse.json({ error: "unknown or expired state" }, { status: 403 });
  }
  await r.del(`x:oauth:state:${state}`);

  const tokenRes = await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: CALLBACK_URI,
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!tokenRes.ok) {
    const detail = await tokenRes.text();
    console.error("X code exchange failed", tokenRes.status, detail.slice(0, 300));
    return NextResponse.json({ error: "code exchange failed" }, { status: 502 });
  }
  const data = (await tokenRes.json()) as TokenResponse;
  if (!data.refresh_token) {
    return NextResponse.json(
      { error: "no refresh_token returned — is offline.access granted?" },
      { status: 502 }
    );
  }

  const meRes = await fetch("https://api.x.com/2/users/me", {
    headers: { Authorization: `Bearer ${data.access_token}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!meRes.ok) {
    const detail = await meRes.text();
    console.error("X /users/me failed", meRes.status, detail.slice(0, 300));
    return NextResponse.json({ error: "failed to fetch bot identity" }, { status: 502 });
  }
  const me = (await meRes.json()) as { data: { id: string; username: string } };

  const token: BotToken = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
  const identity: BotMe = { id: me.data.id, handle: me.data.username };
  await r.set("x:bot:token", token);
  await r.set("x:bot:me", identity);

  return NextResponse.json({ ok: true, bot: identity });
}
