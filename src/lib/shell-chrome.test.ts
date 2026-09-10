import { describe, expect, it } from "vitest";
import {
  activeNavLabel,
  isActiveNavPath,
  mobileNavDescription,
  notifyBellLabel,
  showsMobileNotifyBell,
} from "@/lib/shell-chrome";
import { shellNavItems } from "@/lib/shell-persona";

const PORTAL_NAV = [
  { href: "/portal", label: "Home" },
  { href: "/portal/forms", label: "Forms" },
  { href: "/portal/messages", label: "Messages" },
  { href: "/portal/calendar", label: "Visits" },
];

describe("isActiveNavPath", () => {
  it("matches a route exactly", () => {
    expect(isActiveNavPath("/doula/messages", "/doula/messages")).toBe(true);
  });

  it("matches a route's own subtree", () => {
    expect(isActiveNavPath("/doula/clients/abc", "/doula/clients")).toBe(true);
  });

  it("never lights Home from a prefix — every staff route starts with /doula", () => {
    expect(isActiveNavPath("/doula/invoices", "/doula")).toBe(false);
    expect(isActiveNavPath("/portal/forms", "/portal")).toBe(false);
    expect(isActiveNavPath("/doula", "/doula")).toBe(true);
  });
});

describe("activeNavLabel", () => {
  it("names the page the phone's top bar is showing", () => {
    expect(activeNavLabel("/portal/messages", PORTAL_NAV)).toBe("Messages");
  });

  it("prefers the deepest match over Home", () => {
    const nav = shellNavItems("agency", "NOVA Birth Partners");
    expect(activeNavLabel("/doula/messages", nav)).toBe("Messages");
    expect(activeNavLabel("/doula/clients/abc-123", nav)).toBe("Clients");
    expect(activeNavLabel("/doula", nav)).toBe("Home");
  });

  it("says nothing rather than guessing on a route that is not in the nav", () => {
    expect(activeNavLabel("/doula/nowhere-in-nav", PORTAL_NAV)).toBe(null);
  });
});

describe("notifyBellLabel", () => {
  it("reads the good news out loud at zero", () => {
    expect(notifyBellLabel(0)).toBe("Notifications — nobody is waiting on you");
  });

  it("counts families, not alerts", () => {
    expect(notifyBellLabel(1)).toContain("1 family needs");
    expect(notifyBellLabel(3)).toContain("3 families need");
  });
});

describe("showsMobileNotifyBell", () => {
  it("gives staff the queue and leaves the family bar to the practice name", () => {
    expect(showsMobileNotifyBell("doula")).toBe(true);
    expect(showsMobileNotifyBell("client")).toBe(false);
  });
});

describe("mobileNavDescription", () => {
  it("describes the drawer by the brand that opened it", () => {
    expect(mobileNavDescription("NOVA Birth Prep")).toContain("NOVA Birth Prep");
  });
});
