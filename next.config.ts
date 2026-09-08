import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["postgres", "@neondatabase/serverless", "@dropbox/sign"],
  // Server Action bodies cap at 1MB by default, which a 2MB provider photo would exceed
  // before the action ever runs. MAX_PHOTO_BYTES stays the real limit.
  experimental: {
    serverActions: { bodySizeLimit: "3mb" },
  },
  images: {
    // Provider photos are the only images we optimize, and they are always same-origin.
    localPatterns: [{ pathname: "/api/media/**", search: "" }],
  },
};

export default nextConfig;
