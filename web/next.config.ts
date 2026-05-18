import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: process.cwd(),
  serverExternalPackages: ['better-sqlite3'],
  devIndicators: false,
};

export default nextConfig;
