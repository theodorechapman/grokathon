import Link from "next/link";
import { readSession } from "@/lib/session";
import { SignInButton } from "./sign-in-button";

export async function SiteNav({
  active,
}: {
  active: "home" | "arcade" | "create" | "leaderboard" | "my";
}) {
  const session = await readSession().catch(() => null);
  return (
    <nav className="siteNav">
      <Link href="/" className="siteNavBrand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/nova-lockup.png" alt="Nova" className="siteNavLockup" />
      </Link>
      <div className="siteNavRight">
        <div className="siteNavPill">
          <Link
            href="/arcade"
            className={active === "arcade" ? "navSegment navSegmentActive" : "navSegment"}
          >
            Arcade
          </Link>
          {session ? (
            <>
              <Link
                href="/create"
                className={active === "create" ? "navSegment navSegmentActive" : "navSegment"}
              >
                Create
              </Link>
              <Link
                href="/leaderboard"
                className={
                  active === "leaderboard" ? "navSegment navSegmentActive" : "navSegment"
                }
              >
                Leaderboard
              </Link>
            </>
          ) : (
            <SignInButton />
          )}
          <Link
            href="/my"
            className={active === "my" ? "navSegment navSegmentActive" : "navSegment"}
          >
            My games
          </Link>
        </div>
        {session && (
          <span className="authChip">
            @{session.handle}
            <a href="/api/auth/logout" className="authOut" title="Sign out">
              ✕
            </a>
          </span>
        )}
      </div>
    </nav>
  );
}
