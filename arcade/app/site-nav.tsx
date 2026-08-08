import Link from "next/link";
import { readSession } from "@/lib/session";
import { AuthButton } from "./auth-button";

export async function SiteNav({ active }: { active: "home" | "arcade" }) {
  const session = await readSession().catch(() => null);
  return (
    <nav className="siteNav">
      <Link href="/" className="siteNavBrand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/nova-lockup.png" alt="Nova" className="siteNavLockup" />
      </Link>
      <div className="siteNavPill">
        <Link
          href="/arcade"
          className={active === "arcade" ? "navSegment navSegmentActive" : "navSegment"}
        >
          Arcade
        </Link>
        <span className="navDivider" />
        {session ? (
          <span className="navSegment navUser">
            @{session.handle}
            <a href="/api/auth/logout" className="authOut" title="Sign out">
              ✕
            </a>
          </span>
        ) : (
          <AuthButton />
        )}
      </div>
    </nav>
  );
}
