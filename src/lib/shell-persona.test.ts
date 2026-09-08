import { describe, expect, it } from "vitest";
import {
  agencyBoardSummary,
  agencyNavLabel,
  clientsEmpty,
  clientsHeading,
  clientsLegend,
  homeClientsEmpty,
  homeCtaLabel,
  navGroupLabel,
  shellNavGroups,
  shellNavItems,
  shellNewItems,
  shellPersona,
  shellSearchTargets,
} from "./shell-persona";
import { demoAccount } from "./demo-logins";

const AGENCY_ONLY = ["/doula/team", "/doula/settings", "/doula/settings/email"];

describe("shell persona (TOK-34 D1)", () => {
  it("gives owners and admins the agency shell and everyone else the doula shell", () => {
    expect(shellPersona("owner")).toBe("agency");
    expect(shellPersona("admin")).toBe("agency");
    expect(shellPersona("doula")).toBe("doula");
    expect(shellPersona(null)).toBe("doula");
    expect(shellPersona(undefined)).toBe("doula");
    // Same case-sensitivity as the write guard it is derived from — no free upgrade.
    expect(shellPersona("OWNER")).toBe("doula");
  });

  it("keeps Team, Brand, and Email templates out of the doula rail", () => {
    const hrefs = shellNavItems("doula", "NOVA Birth Partners").map((item) => item.href);
    for (const href of AGENCY_ONLY) expect(hrefs).not.toContain(href);
    expect(hrefs).toContain("/doula/clients");
    expect(hrefs).toContain("/doula/messages");
    expect(hrefs).toContain("/doula/profile");
  });

  it("keeps them in the agency rail", () => {
    const hrefs = shellNavItems("agency", "NOVA Birth Partners").map((item) => item.href);
    expect(hrefs).toContain("/doula/team");
    expect(hrefs).toContain("/doula/settings");
  });

  it("puts no agency word on a doula's rail, whatever the href is", () => {
    // Priya's real membership row, not a hand-written "doula" — the founder complaint was
    // about what she sees after signing in, and the role is what decides it.
    const persona = shellPersona(demoAccount("priya").membershipRole);
    expect(persona).toBe("doula");
    const groups = shellNavGroups(persona, "NOVA Birth Partners");
    expect(groups[0]?.label).toBe("My practice");
    const words = groups.flatMap((group) => [group.label, ...group.items.map((i) => i.label)]);
    for (const word of ["Team", "Settings", "Pipeline", "NOVA", "Brand"]) {
      expect(words).not.toContain(word);
    }
    expect(clientsHeading(persona)).toBe("Your families");
  });

  it("never renders an empty nav group", () => {
    for (const persona of ["agency", "doula"] as const) {
      for (const group of shellNavGroups(persona, "NOVA Birth Partners")) {
        expect(group.items.length).toBeGreaterThan(0);
        expect(group.label).not.toBe("");
      }
    }
  });
});

describe("nav group label", () => {
  it("names the practice for a doula and the agency for an owner", () => {
    expect(navGroupLabel("doula", "NOVA Birth Partners")).toBe("My practice");
    expect(navGroupLabel("agency", "NOVA Birth Partners")).toBe("NOVA");
  });

  it("keeps a short org name whole and shortens a long one to its first word", () => {
    expect(agencyNavLabel("Cedar Birth")).toBe("Cedar Birth");
    expect(agencyNavLabel("Cedar Birth Collective")).toBe("Cedar");
    expect(agencyNavLabel("Bloom")).toBe("Bloom");
  });

  it("falls back to the generic word rather than truncating into nonsense", () => {
    expect(agencyNavLabel(null)).toBe("Agency");
    expect(agencyNavLabel("   ")).toBe("Agency");
    // First word is itself too long to sit on the rail line.
    expect(agencyNavLabel("Northernvirginiabirthwork Partners")).toBe("Agency");
  });
});

describe("clients board copy (TOK-34 D2, D3)", () => {
  it("calls it a pipeline for an agency and families for a doula", () => {
    expect(clientsHeading("agency")).toBe("Pipeline");
    expect(clientsHeading("doula")).toBe("Your families");
  });

  it("keeps the stage funnel out of the doula legend", () => {
    expect(clientsLegend("agency")).toContain("new lead");
    expect(clientsLegend("doula").toLowerCase()).not.toContain("lead");
  });

  it("empties never call a family a lead to the doula who has her", () => {
    expect(clientsEmpty("agency").title).toBe("Pipeline is empty");
    expect(clientsEmpty("doula").title).toBe("No families yet");
    expect(clientsEmpty("doula").body.toLowerCase()).not.toContain("lead");
    expect(clientsEmpty("doula").body.toLowerCase()).not.toContain("pipeline");
  });
});

describe("home copy (TOK-34 D5)", () => {
  it("says lead on the agency home and family on the doula home", () => {
    expect(homeClientsEmpty("agency")).toContain("creates a lead here");
    expect(homeClientsEmpty("doula")).toContain("creates a family here");
    expect(homeClientsEmpty("doula").toLowerCase()).not.toContain("lead");
  });

  it("matches the call to action to the board it opens", () => {
    expect(homeCtaLabel("agency")).toBe("Open pipeline");
    expect(homeCtaLabel("doula")).toBe("Open clients");
  });
});

describe("top bar (TOK-34 D4, D6)", () => {
  it("opens the pipeline for an agency and clients plus a new family for a doula", () => {
    const agency = shellNewItems("agency").map((item) => item.label);
    expect(agency[0]).toBe("Open pipeline");

    const doula = shellNewItems("doula");
    expect(doula[0]?.label).toBe("Open clients");
    expect(doula[1]?.label).toContain("New family");
    // There is no create-a-client form, so "New family" points at the Book Consult link.
    expect(doula[1]?.href).toBe("/doula/profile");
    expect(doula.map((item) => item.label).join(" ")).not.toContain("pipeline");
  });

  it("labels the search entry Clients for a doula and Clients / pipeline for an agency", () => {
    const label = (persona: "agency" | "doula") =>
      shellSearchTargets(persona).find((target) => target.href === "/doula/clients")?.label;
    expect(label("agency")).toBe("Clients / pipeline");
    expect(label("doula")).toBe("Clients");
  });

  it("does not let a doula search her way into agency chrome", () => {
    const hrefs = shellSearchTargets("doula").map((target) => target.href);
    for (const href of AGENCY_ONLY) expect(hrefs).not.toContain(href);

    const agencyHrefs = shellSearchTargets("agency").map((target) => target.href);
    for (const href of AGENCY_ONLY) expect(agencyHrefs).toContain(href);
  });

  it("only offers destinations that exist in the matching rail or are reachable from it", () => {
    for (const persona of ["agency", "doula"] as const) {
      const navHrefs = new Set(shellNavItems(persona, "NOVA").map((item) => item.href));
      for (const target of shellSearchTargets(persona)) {
        expect(navHrefs.has(target.href) || target.href.startsWith("/doula/settings")).toBe(true);
      }
      for (const item of shellNewItems(persona)) {
        expect(navHrefs.has(item.href)).toBe(true);
      }
    }
  });
});

describe("agency board summary (TOK-34 D7)", () => {
  it("counts the families an assignment-scoped list would have hidden", () => {
    expect(agencyBoardSummary(3, 1)).toBe("3 families · 1 without a primary doula");
    expect(agencyBoardSummary(1, 1)).toBe("1 family · 1 without a primary doula");
    expect(agencyBoardSummary(4, 0)).toBe("4 families · every one has a primary doula");
  });

  it("says nothing about primaries when there are no families", () => {
    expect(agencyBoardSummary(0, 0)).toBe("No families in this practice yet");
  });
});
