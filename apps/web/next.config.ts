import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @ranklark/core ships TypeScript source (no build step) — let Next compile it.
  transpilePackages: ["@ranklark/core"],
  serverExternalPackages: ["better-sqlite3"],
  images: { remotePatterns: [{ protocol: "https", hostname: "*.mzstatic.com" }] },
};

export default nextConfig;
