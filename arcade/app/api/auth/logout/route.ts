import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

const SITE = "https://playgrokgames.vercel.app";

export async function GET() {
  const res = NextResponse.redirect(`${SITE}/arcade`);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
