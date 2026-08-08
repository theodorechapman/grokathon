import Link from "next/link";

export function SiteNav({ active }: { active: "home" | "arcade" }) {
  return (
    <nav className="siteNav">
      <Link href="/" className="siteNavBrand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/nova-lockup.png" alt="Nova" className="siteNavLockup" />
      </Link>
      <div className="siteNavPill">
        <Link href="/arcade" className={active === "arcade" ? "siteNavActive" : undefined}>
          Arcade
        </Link>
      </div>
    </nav>
  );
}
