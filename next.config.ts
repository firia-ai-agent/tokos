import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["postgres", "@neondatabase/serverless", "@dropbox/sign"],
  // Server Action bodies cap at 1MB by default, which a 2MB provider photo would exceed
  // before the action ever runs. MAX_PHOTO_BYTES stays the real limit.
  experimental: {
    serverActions: { bodySizeLimit: "3mb" },
  },
  // Vocabulary redirects: the URL a person types is not always the URL we route on.
  // Redirects are checked before the filesystem, so these never shadow a real page, and
  // Next carries the query string through — /sign-in?error=credentials still shows the
  // error on /login.
  //
  // "Visits" is what the nav and a family call the calendar, so /portal/visits is the
  // URL people type and share — it used to 404. Redirecting here rather than from a
  // page under the portal segment keeps it a real 308: the portal layout streams, so a
  // permanentRedirect() inside it degrades to a client-side meta refresh.
  //
  // /sign-in is the other one: the button says "Sign in", so that is what people type
  // and what stale links point at, but the canonical auth page — and Auth.js's
  // `pages.signIn` — is /login. Keeping the redirect in config rather than adding a
  // sign-in route means the NextAuth callback and post-login flow never see it.
  async redirects() {
    return [
      { source: "/portal/visits", destination: "/portal/calendar", permanent: true },
      { source: "/sign-in", destination: "/login", permanent: true },
      { source: "/signin", destination: "/login", permanent: true },
    ];
  },
  images: {
    // Provider photos are the only images we optimize, and they are always same-origin.
    localPatterns: [{ pathname: "/api/media/**", search: "" }],
  },
};

export default nextConfig;
