import type { Metadata } from "next";
import { DM_Sans, IBM_Plex_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-sans" });
const plexMono = IBM_Plex_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://playgrokgames.vercel.app"),
  title: "Nova — every game starts as a sentence",
  description: "Say a game and Nova makes it real: built by Grok, proven playable by a bot, live in your browser in seconds.",
  openGraph: {
    title: "Nova",
    description: "Every game starts as a sentence. Built on Grok.",
    url: "https://playgrokgames.vercel.app",
    siteName: "Nova",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Nova",
    description: "Every game starts as a sentence. Built on Grok.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${dmSans.variable} ${plexMono.variable}`}>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
