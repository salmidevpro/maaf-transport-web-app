import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async redirects() {
    return [{ source: "/how-it-works", destination: "/security", permanent: true }];
  },
};

export default nextConfig;
