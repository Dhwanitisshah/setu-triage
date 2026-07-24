import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The root package.json (for scripts/) puts a second lockfile above this
  // directory, which makes Next.js guess the workspace root instead of
  // inferring it — pin it explicitly so a Vercel build can't pick the wrong
  // one.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
