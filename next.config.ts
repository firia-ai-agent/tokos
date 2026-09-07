import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["postgres", "@neondatabase/serverless", "@dropbox/sign"],
};

export default nextConfig;
