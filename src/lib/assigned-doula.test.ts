import { describe, expect, it } from "vitest";
import { pickAssignedDoula, type DoulaCandidate } from "./assigned-doula";

const NOVA = "11111111-1111-4111-8111-111111111111";
const CEDAR = "11111111-1111-4111-8111-111111111112";
const MAYA = "22222222-2222-4222-8222-222222222221";
const PRIYA = "22222222-2222-4222-8222-222222222222";
const RILEY = "22222222-2222-4222-8222-222222222223";

const engagementPrimary: DoulaCandidate = {
  organizationId: NOVA,
  userId: MAYA,
  name: "Maya Chen",
  source: "engagement",
};

const activeAssignment: DoulaCandidate = {
  organizationId: NOVA,
  userId: PRIYA,
  name: "Priya Raman",
  source: "assignment",
};

describe("assigned doula name", () => {
  it("names the engagement's primary doula", () => {
    const doula = pickAssignedDoula({
      organizationId: NOVA,
      candidates: [engagementPrimary],
      portalName: "NOVA Birth Prep",
    });
    expect(doula).toEqual({
      name: "Maya Chen",
      firstName: "Maya",
      userId: MAYA,
      source: "engagement",
    });
  });

  it("prefers the engagement primary over an active assignment, whatever the order", () => {
    expect(
      pickAssignedDoula({
        organizationId: NOVA,
        candidates: [activeAssignment, engagementPrimary],
        portalName: "NOVA Birth Prep",
      }).name,
    ).toBe("Maya Chen");
    expect(
      pickAssignedDoula({
        organizationId: NOVA,
        candidates: [engagementPrimary, activeAssignment],
        portalName: "NOVA Birth Prep",
      }).name,
    ).toBe("Maya Chen");
  });

  it("falls back to the active assignment when no engagement carries a primary", () => {
    const doula = pickAssignedDoula({
      organizationId: NOVA,
      candidates: [activeAssignment],
      portalName: "NOVA Birth Prep",
    });
    expect(doula.name).toBe("Priya Raman");
    expect(doula.firstName).toBe("Priya");
    expect(doula.source).toBe("assignment");
  });

  it("keeps the first candidate's order within a source (primary before co-doula)", () => {
    const doula = pickAssignedDoula({
      organizationId: NOVA,
      candidates: [
        activeAssignment,
        { organizationId: NOVA, userId: RILEY, name: "Riley Voss", source: "assignment" },
      ],
      portalName: "NOVA Birth Prep",
    });
    expect(doula.name).toBe("Priya Raman");
  });
});

describe("fallback to the practice", () => {
  it("uses the org portal name when nobody is assigned", () => {
    const doula = pickAssignedDoula({
      organizationId: NOVA,
      candidates: [],
      portalName: "NOVA Birth Prep",
    });
    expect(doula).toEqual({
      name: "NOVA Birth Prep",
      // A practice has no first name — the whole brand is what a family reads.
      firstName: "NOVA Birth Prep",
      userId: null,
      source: "organization",
    });
  });

  it("never leaves a family reading a blank or a placeholder", () => {
    expect(
      pickAssignedDoula({ organizationId: NOVA, candidates: [], portalName: "   " }).name,
    ).toBe("Your care team");
    expect(
      pickAssignedDoula({ organizationId: NOVA, candidates: [], portalName: null }).name,
    ).toBe("Your care team");
  });

  it("ignores candidates with no user or no name", () => {
    const doula = pickAssignedDoula({
      organizationId: NOVA,
      candidates: [
        { organizationId: NOVA, userId: null, name: "Ghost Row", source: "engagement" },
        { organizationId: NOVA, userId: MAYA, name: "   ", source: "assignment" },
      ],
      portalName: "NOVA Birth Prep",
    });
    expect(doula.name).toBe("NOVA Birth Prep");
    expect(doula.userId).toBeNull();
  });
});

describe("org isolation", () => {
  it("never names a doula from another organization", () => {
    const doula = pickAssignedDoula({
      organizationId: NOVA,
      candidates: [
        { organizationId: CEDAR, userId: RILEY, name: "Riley Voss", source: "engagement" },
        { organizationId: CEDAR, userId: RILEY, name: "Riley Voss", source: "assignment" },
      ],
      portalName: "NOVA Birth Prep",
    });
    expect(doula.name).toBe("NOVA Birth Prep");
    expect(doula.userId).toBeNull();
  });

  it("still finds this org's doula when a foreign row is mixed in", () => {
    const doula = pickAssignedDoula({
      organizationId: NOVA,
      candidates: [
        { organizationId: CEDAR, userId: RILEY, name: "Riley Voss", source: "engagement" },
        activeAssignment,
      ],
      portalName: "NOVA Birth Prep",
    });
    expect(doula.userId).toBe(PRIYA);
  });
});
