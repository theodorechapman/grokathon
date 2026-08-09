import { createHash, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/stats";

const CALLBACK_URI = "https://playgrokgames.vercel.app/api/x/authorize/callback";
const SCOPES = "tweet.read tweet.write users.read like.read offline.access";

/** One-time admin flow: redirects to X to mint the bot's user token (PKCE). */
export async function GET(req: NextRequest) {
  const adminSecret = process.env.X_ADMIN_SECRET;
  if (!adminSecret) {
    return NextResponse.json({ error: "X_ADMIN_SECRET not configured" }, { status: 503 });
  }
  if (req.nextUrl.searchParams.get("secret") !== adminSecret) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const clientId = process.env.X_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "X_CLIENT_ID not configured" }, { status: 503 });
  }
  const r = redis();
  if (!r) {
    return NextResponse.json({ error: "Redis not configured" }, { status: 503 });
  }

  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");

  // One-time state record; callback 403s without it, so only this guarded
  // route can start a flow that the callback will complete.
  await r.set(`x:oauth:state:${state}`, verifier, { ex: 600 });

  const url = new URL("https://x.com/i/oauth2/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", CALLBACK_URI);
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return NextResponse.redirect(url);
}
