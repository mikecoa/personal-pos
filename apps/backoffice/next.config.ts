import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@pos/core"],
  // Production builds use their own folder so `next build` never clobbers a running `next dev`.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default config;
