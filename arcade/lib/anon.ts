import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";

export const ANON_COOKIE = "nova-anon";
export const ANON_RE = /^[0-9a-f]{32}$/;

/**
 * Server-bound anon identity. The cookie is the source of truth; a
 * body-supplied id is honored only once, on the request that first sets the
 * cookie, so existing guests keep their localStorage identity while nobody
 * can submit as an arbitrary id afterwards (the cookie is HttpOnly).
 */
export function resolveAnon(
  req: NextRequest,
  bodyAnon?: string
): { id: string; isNew: boolean } {
  const fromCookie = req.cookies.get(ANON_COOKIE)?.value ?? "";
  if (ANON_RE.test(fromCookie)) return { id: fromCookie, isNew: false };
  const adopted = ANON_RE.test(bodyAnon ?? "") ? bodyAnon! : randomBytes(16).toString("hex");
  return { id: adopted, isNew: true };
}

export function setAnonCookie(res: NextResponse, id: string): void {
  res.cookies.set(ANON_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
}
