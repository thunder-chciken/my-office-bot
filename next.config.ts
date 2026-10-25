import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The old comparison page now points at the plain list of what the app does.
  async redirects() {
    return [{ source: "/compare", destination: "/features", permanent: true }];
  },
};

export default nextConfig;
