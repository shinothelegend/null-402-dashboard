import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The null-402 SDK is shipped as TypeScript source in the monorepo.
  transpilePackages: ["null-402"],
};

export default nextConfig;
