import { describe, expect, it } from "vitest";
import { paidBannerCopy, portalBanners, signedBannerCopy } from "./client-copy";

describe("portal banners (TOK-39 E6)", () => {
  it("is the exact signed line the ticket asked for", () => {
    expect(signedBannerCopy("Maya")).toBe(
      "Thanks — Maya still confirms fit, and payment finishes it.",
    );
  });

  it("drops the internal Complete rule the old banner recited", () => {
    expect(signedBannerCopy("Maya")).not.toMatch(/booked|clears|first payment clears/i);
  });

  it("names the doula rather than 'your doula'", () => {
    expect(signedBannerCopy("Priya")).toContain("Priya");
    expect(paidBannerCopy("Priya")).toContain("Priya");
    expect(`${signedBannerCopy("Priya")} ${paidBannerCopy("Priya")}`).not.toMatch(/your doula/i);
  });

  it("raises nothing when the family just navigated to Home", () => {
    expect(portalBanners({}, "Maya")).toEqual([]);
  });

  it("raises one banner per flag, in the order they happened", () => {
    expect(portalBanners({ signed: "1", paid: "1" }, "Maya").map((b) => b.key)).toEqual([
      "signed",
      "paid",
    ]);
    expect(portalBanners({ paid: "1" }, "Maya").map((b) => b.key)).toEqual(["paid"]);
  });

  it("carries the copy, so the page never writes a sentence", () => {
    expect(portalBanners({ signed: "1" }, "Maya")[0].text).toBe(signedBannerCopy("Maya"));
  });
});
