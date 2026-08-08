import Link from "next/link";
import { readSession } from "@/lib/session";

export async function SiteNav({ active }: { active: "home" | "arcade" | "leaderboard" }) {
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
          <Link
            href="/leaderboard"
            className={active === "leaderboard" ? "navSegment navSegmentActive" : "navSegment"}
          >
            Leaderboard
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
