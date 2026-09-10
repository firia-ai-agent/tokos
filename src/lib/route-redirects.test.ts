import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

async function redirects() {
  const configured = nextConfig.redirects;
  expect(configured).toBeTypeOf("function");
  return (await configured!()) ?? [];
}

describe("legacy route redirects (TOK-13)", () => {
  it("lands every spelling of the sign-in URL on the canonical /login page", async () => {
    const rules = await redirects();
    for (const source of ["/sign-in", "/signin"]) {
      const rule = rules.find((entry) => entry.source === source);
      expect(rule, `${source} should redirect rather than 404`).toBeDefined();
      expect(rule!.destination).toBe("/login");
      expect(rule!.permanent).toBe(true);
    }
  });

  it("never redirects away from /login itself, so the canonical page cannot loop", async () => {
    const rules = await redirects();
    expect(rules.some((entry) => entry.source === "/login")).toBe(false);
  });

  it("keeps the /portal/visits redirect it shares the block with", async () => {
    const rules = await redirects();
    const visits = rules.find((entry) => entry.source === "/portal/visits");
    expect(visits?.destination).toBe("/portal/calendar");
  });
});
