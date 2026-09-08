import { describe, expect, it } from "vitest";
import {
  contrastInk,
  sanitizeBrand,
  sanitizeFooterHtml,
  sanitizeHexColor,
  sanitizePhone,
  sanitizeTimezone,
  sanitizeUrl,
  type BrandValues,
} from "./brand";

const current: BrandValues = {
  portalName: "NOVA Birth Partners",
  primaryColor: "#0F6E56",
  websiteUrl: "https://novabirthpartners.com",
  onCallPhone: "(703) 555-0148",
  footerHtml: "NOVA Birth Partners · Northern Virginia",
  confidentialityBlurb: "What you share stays here.",
  timezone: "America/New_York",
};

describe("sanitizeHexColor", () => {
  it("expands shorthand and upper-cases", () => {
    expect(sanitizeHexColor("#abc")).toBe("#AABBCC");
    expect(sanitizeHexColor("0f6e56")).toBe("#0F6E56");
  });

  it("falls back rather than writing junk into a style attribute", () => {
    expect(sanitizeHexColor("rebeccapurple")).toBe("#0F6E56");
    expect(sanitizeHexColor("javascript:alert(1)", "#111111")).toBe("#111111");
    expect(sanitizeHexColor("", "#111111")).toBe("#111111");
    expect(sanitizeHexColor("#12345")).toBe("#0F6E56");
  });
});

describe("sanitizeUrl", () => {
  it("adds https when a bare host is typed", () => {
    expect(sanitizeUrl("novabirthpartners.com")).toBe("https://novabirthpartners.com");
  });

  it("keeps an http(s) URL and trims the trailing slash", () => {
    expect(sanitizeUrl("https://example.com/")).toBe("https://example.com");
  });

  it("refuses anything that is not http(s)", () => {
    expect(sanitizeUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeUrl("  ")).toBeNull();
  });
});

describe("sanitizePhone", () => {
  it("keeps phone punctuation and drops the rest", () => {
    expect(sanitizePhone("(703) 555-0148 x12")).toBe("(703) 555-0148 x12");
    expect(sanitizePhone("<b>703-555-0148</b>")).toBe("703-555-0148");
    expect(sanitizePhone("")).toBeNull();
  });
});

describe("sanitizeFooterHtml", () => {
  it("keeps the inline formatting a footer needs", () => {
    expect(sanitizeFooterHtml('<p>NOVA · <a href="https://x.com">site</a></p>')).toBe(
      '<p>NOVA · <a href="https://x.com">site</a></p>',
    );
  });

  it("removes a script block and its contents", () => {
    expect(sanitizeFooterHtml("<p>ok</p><script>alert(1)</script>")).toBe("<p>ok</p>");
  });

  it("unwraps tags that do not belong in a footer", () => {
    expect(sanitizeFooterHtml("<div><b>NOVA</b></div>")).toBe("<b>NOVA</b>");
  });

  it("strips event handlers and javascript hrefs", () => {
    expect(sanitizeFooterHtml('<span onclick="steal()">hi</span>')).toBe("<span>hi</span>");
    expect(sanitizeFooterHtml('<a href="javascript:alert(1)">x</a>')).toBe("<a>x</a>");
  });

  it("reads an empty footer as no footer", () => {
    expect(sanitizeFooterHtml("   ")).toBeNull();
    expect(sanitizeFooterHtml("<script>x</script>")).toBeNull();
  });
});

describe("sanitizeTimezone", () => {
  it("only accepts a zone from the picker", () => {
    expect(sanitizeTimezone("America/Chicago")).toBe("America/Chicago");
    expect(sanitizeTimezone("Mars/Olympus", "America/Denver")).toBe("America/Denver");
  });
});

describe("sanitizeBrand", () => {
  it("cleans the whole form in one pass", () => {
    expect(
      sanitizeBrand(
        {
          portalName: "  Nova Birth  ",
          primaryColor: "#abc",
          websiteUrl: "novabirthpartners.com",
          onCallPhone: "703-555-0148",
          footerHtml: "<p>Nova</p><script>x</script>",
          confidentialityBlurb: "<b>Private</b>",
          timezone: "America/Denver",
        },
        current,
      ),
    ).toEqual({
      portalName: "Nova Birth",
      primaryColor: "#AABBCC",
      websiteUrl: "https://novabirthpartners.com",
      onCallPhone: "703-555-0148",
      footerHtml: "<p>Nova</p>",
      confidentialityBlurb: "Private",
      timezone: "America/Denver",
    });
  });

  it("keeps the fields the app depends on when a box is cleared", () => {
    const next = sanitizeBrand(
      { portalName: "", primaryColor: "", timezone: "" },
      current,
    );
    expect(next.portalName).toBe(current.portalName);
    expect(next.primaryColor).toBe(current.primaryColor);
    expect(next.timezone).toBe(current.timezone);
  });

  it("lets the optional fields be cleared to nothing", () => {
    const next = sanitizeBrand(
      { websiteUrl: "", onCallPhone: "", footerHtml: "", confidentialityBlurb: "" },
      current,
    );
    expect(next.websiteUrl).toBeNull();
    expect(next.onCallPhone).toBeNull();
    expect(next.footerHtml).toBeNull();
    expect(next.confidentialityBlurb).toBeNull();
  });
});

describe("contrastInk", () => {
  it("picks readable ink for the preview chip", () => {
    expect(contrastInk("#0F6E56")).toBe("#FFFFFF");
    expect(contrastInk("#FFF3E6")).toBe("#04342C");
  });
});
