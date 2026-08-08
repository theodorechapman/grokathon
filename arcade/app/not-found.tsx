import Link from "next/link";
import { SiteNav } from "./site-nav";

export default function NotFound() {
  return (
    <main>
      <SiteNav active="arcade" />
      <div className="empty" style={{ marginTop: 64 }}>
        <p>This game doesn&apos;t exist yet. Maybe you should make it.</p>
        <p style={{ marginTop: 16 }}>
          <Link href="/arcade" className="playBtn">
            ← Back to the arcade
          </Link>
        </p>
      </div>
    </main>
  );
}
