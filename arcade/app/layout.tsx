import type { Metadata } from "next";
import { DM_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-sans" });
const plexMono = IBM_Plex_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Grok Games",
  description: "Say a game. Play it in seconds. A bot proves every game runs before you do.",
  openGraph: {
    title: "Grok Games",
    description: "Say a game. Play it in seconds. Remix it live with the room.",
    url: "https://playgrokgames.vercel.app",
    siteName: "Grok Games",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${dmSans.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
