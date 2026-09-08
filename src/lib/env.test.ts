import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appUrl } from "@/lib/env";

const KEYS = ["NEXT_PUBLIC_APP_URL", "AUTH_URL", "VERCEL_URL"] as const;

describe("appUrl", () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
    for (const key of KEYS) delete process.env[key];
  });

  afterEach(() => {
    for (const key of KEYS) {
      const value = saved[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("prefers a real NEXT_PUBLIC_APP_URL and strips the trailing slash", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://tokos.example.com/";
    process.env.AUTH_URL = "https://auth.example.com";
    process.env.VERCEL_URL = "tokos-tip.vercel.app";
    expect(appUrl()).toBe("https://tokos.example.com");
  });

  it("falls through to AUTH_URL when NEXT_PUBLIC_APP_URL is loopback", () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://127.0.0.1:43127";
    process.env.AUTH_URL = "https://auth.example.com";
    expect(appUrl()).toBe("https://auth.example.com");
  });

  it("ignores loopback NEXT_PUBLIC_APP_URL / AUTH_URL and uses VERCEL_URL", () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://127.0.0.1:43127";
    process.env.AUTH_URL = "http://LocalHost:43127";
    process.env.VERCEL_URL = "tokos-tip.vercel.app";
    expect(appUrl()).toBe("https://tokos-tip.vercel.app");
  });

  it("uses VERCEL_URL when no app/auth url is set", () => {
    process.env.VERCEL_URL = "tokos-tip.vercel.app";
    expect(appUrl()).toBe("https://tokos-tip.vercel.app");
  });

  it("falls back to the local url when nothing else applies", () => {
    expect(appUrl()).toBe("http://127.0.0.1:43127");
  });

  it("falls back to the local url when every candidate is loopback", () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    process.env.AUTH_URL = "http://127.0.0.1:43127";
    expect(appUrl()).toBe("http://127.0.0.1:43127");
  });
});
