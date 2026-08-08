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
  title: "Nova — every game starts as a sentence",
  description: "Say a game and Nova makes it real: built by Grok, proven playable by a bot, live in your browser in seconds.",
  openGraph: {
    title: "Nova",
    description: "Every game starts as a sentence. Built on Grok.",
    url: "https://playgrokgames.vercel.app",
    siteName: "Nova",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${dmSans.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
