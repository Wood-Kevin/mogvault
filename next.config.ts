import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // data/source-index.json is read via fs.readFileSync at runtime by
  // /api/search/items and /api/farming-list. Vercel's output file tracing
  // won't detect readFileSync calls automatically, so we explicitly include
  // the data directory in every route's bundle to ensure it's present in prod.
  outputFileTracingIncludes: {
    "/**": ["./data/**/*"],
  },
};

export default nextConfig;
