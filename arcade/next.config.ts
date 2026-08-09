import type { NextConfig } from "next";

const crossOriginIsolationHeaders = [
  { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  // Game pages fs-check bundle files (source.c) at runtime; trace the whole
  // games tree into the function or the check silently fails on Vercel.
  outputFileTracingIncludes: {
    "/g/[slug]": ["./public/games/**"],
  },
  async headers() {
    return [
      {
        source: "/g/:slug",
        headers: crossOriginIsolationHeaders,
      },
      {
        source: "/games/:path*",
        headers: crossOriginIsolationHeaders,
      },
    ];
  },
};

export default nextConfig;
