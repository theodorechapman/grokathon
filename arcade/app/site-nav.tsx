import Link from "next/link";
import { readSession } from "@/lib/session";

export async function SiteNav({ active }: { active: "home" | "arcade" }) {
  const session = await readSession().catch(() => null);
  return (
    <nav className="siteNav">
      <Link href="/" className="siteNavBrand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/nova-lockup.png" alt="Nova" className="siteNavLockup" />
      </Link>
      <div className="siteNavRight">
        <div className="siteNavPill">
          <Link href="/arcade" className={active === "arcade" ? "siteNavActive" : undefined}>
            Arcade
          </Link>
        </div>
        {session ? (
          <span className="authChip">
            @{session.handle}
            <a href="/api/auth/logout" className="authOut" title="Sign out">
              ✕
            </a>
          </span>
        ) : (
          <a href="/api/auth/login" className="authBtn">
            Sign in with 𝕏
          </a>
        )}
      </div>
    </nav>
  );
}
