import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const apiTarget = process.env.API_PROXY_TARGET;
    const graderTarget = process.env.GRADER_PROXY_TARGET;
    const rewrites = [];

    if (apiTarget) {
      rewrites.push({
        source: "/api-proxy/:path*",
        destination: `${apiTarget.replace(/\/$/, "")}/:path*`,
      });
    }

    if (graderTarget) {
      rewrites.push({
        source: "/grader-proxy/:path*",
        destination: `${graderTarget.replace(/\/$/, "")}/:path*`,
      });
    }

    return rewrites;
  },
};

export default nextConfig;
