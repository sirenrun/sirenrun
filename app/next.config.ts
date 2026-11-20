import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    resolveAlias: {
      fs: { browser: "./lib/empty-module.ts" },
    },
  },
};

export default nextConfig;
