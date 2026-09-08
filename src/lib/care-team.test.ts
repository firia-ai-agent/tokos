import { describe, expect, it } from "vitest";
import {
  formatEdd,
  formatEddNote,
  formatPhoneNumber,
  locationFieldLabel,
  phoneHref,
  pickLocationLabel,
  pickPackageLabel,
} from "./care-team";

describe("package label (TOK-35)", () => {
  it("prefers the agreement over the engagement", () => {
    expect(
      pickPackageLabel([
        { label: "Birth support · full", status: "sent", source: "contract" },
        { label: "Birth support", source: "engagement" },
      ]),
    ).toBe("Birth support · full");
  });

  it("falls back to the engagement while the agreement is still a draft", () => {
    expect(
      pickPackageLabel([
        { label: "Birth support · full", status: "draft", source: "contract" },
        { label: "Birth support · full", source: "engagement" },
      ]),
    ).toBe("Birth support · full");
  });

  it("never reads a package off a withdrawn agreement", () => {
    expect(
      pickPackageLabel([{ label: "Birth support · full", status: "void", source: "contract" }]),
    ).toBeNull();
  });

  it("is null before anything is agreed", () => {
    expect(pickPackageLabel([])).toBeNull();
    expect(pickPackageLabel([{ label: "   ", source: "engagement" }])).toBeNull();
  });
});

describe("EDD wording (TOK-35)", () => {
  it("reads the stored day, not the day before it in a western zone", () => {
    expect(formatEdd("2026-09-29")).toBe("September 29, 2026");
    expect(formatEdd("2026-01-01")).toBe("January 1, 2026");
  });

  it("has nothing to say without a date", () => {
    expect(formatEdd(null)).toBeNull();
    expect(formatEdd("")).toBeNull();
    expect(formatEdd("soon")).toBeNull();
    expect(formatEddNote(null)).toBeNull();
  });

  it("counts down in weeks and singularises one", () => {
    const today = new Date("2026-09-08T12:00:00");
    expect(formatEddNote("2026-09-29", today)).toBe("in 3 weeks");
    expect(formatEddNote("2026-09-15", today)).toBe("in 1 week");
  });

  it("says 'this week' rather than a zero", () => {
    expect(formatEddNote("2026-09-10", new Date("2026-09-08T12:00:00"))).toBe("this week");
  });

  it("goes quiet once the date has passed instead of counting up", () => {
    expect(formatEddNote("2026-08-20", new Date("2026-09-08T12:00:00"))).toBeNull();
  });
});

describe("location (TOK-35)", () => {
  it("puts the family's own city first", () => {
    expect(
      pickLocationLabel({
        city: "Arlington",
        region: "VA",
        engagementLocation: "Alexandria, VA",
        serviceArea: "Arlington, Alexandria, Fairfax, and DC",
      }),
    ).toEqual({ label: "Arlington, VA", source: "client" });
  });

  it("takes whichever half of the address is set", () => {
    expect(pickLocationLabel({ city: "Arlington" })?.label).toBe("Arlington");
    expect(pickLocationLabel({ region: "VA" })?.label).toBe("VA");
  });

  it("falls back to the engagement, then to the practice's service area", () => {
    expect(pickLocationLabel({ engagementLocation: "Arlington, VA" })).toEqual({
      label: "Arlington, VA",
      source: "engagement",
    });
    expect(pickLocationLabel({ serviceArea: "Richmond and Petersburg" })).toEqual({
      label: "Richmond and Petersburg",
      source: "serviceArea",
    });
  });

  it("is null when nobody has recorded a place", () => {
    expect(pickLocationLabel({ city: "  ", region: null, serviceArea: "" })).toBeNull();
  });

  it("does not pass the practice's coverage off as the family's address", () => {
    expect(locationFieldLabel("serviceArea")).toBe("Service area");
    expect(locationFieldLabel("client")).toBe("Location");
    expect(locationFieldLabel("engagement")).toBe("Location");
  });
});

describe("on-call phone (TOK-35)", () => {
  it("formats a US number however it was typed in", () => {
    expect(formatPhoneNumber("7035550148")).toBe("(703) 555-0148");
    expect(formatPhoneNumber("703.555.0148")).toBe("(703) 555-0148");
    expect(formatPhoneNumber("+1 703 555 0148")).toBe("(703) 555-0148");
    expect(formatPhoneNumber("(703) 555-0148")).toBe("(703) 555-0148");
  });

  it("hands back anything it cannot format rather than mangling it", () => {
    expect(formatPhoneNumber("703-555-0148 x12")).toBe("703-555-0148 x12");
    expect(formatPhoneNumber("+44 20 7946 0958")).toBe("+44 20 7946 0958");
    expect(formatPhoneNumber(null)).toBeNull();
    expect(formatPhoneNumber("   ")).toBeNull();
  });

  it("dials the digits, with a country code", () => {
    expect(phoneHref("(703) 555-0148")).toBe("tel:+17035550148");
    expect(phoneHref("+1 703 555 0148")).toBe("tel:+17035550148");
    expect(phoneHref("555-0148")).toBeNull();
    expect(phoneHref(null)).toBeNull();
  });
});
