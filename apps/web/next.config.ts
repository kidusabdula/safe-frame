import type { NextConfig } from "next";

// Static export is the deploy artifact — its existence proves no server is
// involved in detection. There are no API routes anywhere in this app.
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  transpilePackages: ["@safeframe/core"],
};

export default nextConfig;
