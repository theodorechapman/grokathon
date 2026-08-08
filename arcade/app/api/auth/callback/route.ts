import { NextRequest, NextResponse } from "next/server";
import { encodeSession, SESSION_COOKIE } from "@/lib/session";

const SITE = "https://playgrokgames.vercel.app";

export async function GET(req: NextRequest) {
  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "auth not configured" }, { status: 503 });
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const savedState = req.cookies.get("x-oauth-state")?.value;
  const verifier = req.cookies.get("x-oauth-verifier")?.value;

  if (!code || !state || !savedState || !verifier || state !== savedState) {
    return NextResponse.redirect(`${SITE}/arcade?auth=failed`);
  }

  const tokenRes = await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${SITE}/api/auth/callback`,
      code_verifier: verifier,
    }),
  });

  if (!tokenRes.ok) {
    console.error("token exchange failed", tokenRes.status, (await tokenRes.text()).slice(0, 300));
    return NextResponse.redirect(`${SITE}/arcade?auth=failed`);
  }

  const { access_token } = (await tokenRes.json()) as { access_token: string };
  const meRes = await fetch("https://api.x.com/2/users/me", {
    headers: { Authorization: `Bearer ${access_token}` },
  });

  if (!meRes.ok) {
    console.error("users/me failed", meRes.status, (await meRes.text()).slice(0, 300));
    return NextResponse.redirect(`${SITE}/arcade?auth=failed`);
  }

  const me = (await meRes.json()) as { data: { id: string; username: string; name: string } };
  const res = NextResponse.redirect(`${SITE}/arcade`);
  res.cookies.set(
    SESSION_COOKIE,
    encodeSession({ id: me.data.id, handle: me.data.username, name: me.data.name }),
    { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 }
  );
  res.cookies.delete("x-oauth-state");
  res.cookies.delete("x-oauth-verifier");
  return res;
}
