import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Grok Games",
  description: "Ask Grok for a game. Play it in seconds. Remix it live.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
