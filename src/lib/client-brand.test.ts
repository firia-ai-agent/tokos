import { describe, expect, it } from "vitest";
import { DEFAULT_PORTAL_NAME, clientChrome } from "./client-brand";

describe("client chrome (TOK-39 E4)", () => {
  it("splits the seeded NOVA name across the rail's two lines", () => {
    expect(clientChrome("NOVA Birth Prep")).toEqual({
      brand: "NOVA",
      hint: "Birth Prep",
      portalName: "NOVA Birth Prep",
    });
  });

  it("keeps a short name whole, with nothing under it", () => {
    expect(clientChrome("Birth Prep")).toEqual({
      brand: "Birth Prep",
      portalName: "Birth Prep",
    });
  });

  it("falls back to the org name, then to the work — never to the product", () => {
    expect(clientChrome(null, "Cedar Birth Collective").portalName).toBe(
      "Cedar Birth Collective",
    );
    expect(clientChrome("   ", "  ").portalName).toBe(DEFAULT_PORTAL_NAME);
    expect(clientChrome(undefined, undefined).brand).toBe(DEFAULT_PORTAL_NAME);
  });

  it("never says Tokos to a family", () => {
    for (const input of [null, undefined, "", "   ", "NOVA Birth Prep", "Cedar Birth Prep"]) {
      const chrome = clientChrome(input);
      expect(`${chrome.brand} ${chrome.hint ?? ""} ${chrome.portalName}`).not.toMatch(/tokos/i);
    }
  });

  it("trims before it measures, so padding does not force a split", () => {
    expect(clientChrome("  Birth Prep  ")).toEqual({
      brand: "Birth Prep",
      portalName: "Birth Prep",
    });
  });

  it("shows a long single word whole rather than truncating it into nonsense", () => {
    const chrome = clientChrome("Northernmostbirthkeepers");
    expect(chrome.brand).toBe("Northernmostbirthkeepers");
    expect(chrome.hint).toBeUndefined();
  });

  it("always keeps the full name for personMeta, split or not", () => {
    expect(clientChrome("Cedar Birth Prep").portalName).toBe("Cedar Birth Prep");
    expect(clientChrome("Cedar Birth Prep").brand).toBe("Cedar");
  });
});
