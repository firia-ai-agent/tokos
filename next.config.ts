import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["postgres", "@neondatabase/serverless", "@dropbox/sign"],
  // Server Action bodies cap at 1MB by default, which a 2MB provider photo would exceed
  // before the action ever runs. MAX_PHOTO_BYTES stays the real limit.
  experimental: {
    serverActions: { bodySizeLimit: "3mb" },
  },
  // "Visits" is what the nav and a family call the calendar, so /portal/visits is the
  // URL people type and share — it used to 404. Redirecting here rather than from a
  // page under the portal segment keeps it a real 308: the portal layout streams, so a
  // permanentRedirect() inside it degrades to a client-side meta refresh.
  async redirects() {
    return [{ source: "/portal/visits", destination: "/portal/calendar", permanent: true }];
  },
  images: {
    // Provider photos are the only images we optimize, and they are always same-origin.
    localPatterns: [{ pathname: "/api/media/**", search: "" }],
  },
};

export default nextConfig;
