import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  pickAssignedDoula,
  pickPrimaryAssignment,
  type DoulaCandidate,
} from "./assigned-doula";

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

/* ---------------------------------------------------------------------- TOK-67 */

/**
 * The photo bleed, at its source.
 *
 * `sendContract` settled `engagements.primaryDoulaUserId` with an unordered, org-unscoped
 * `limit(1)` over every active assignment. A family with a primary and a backup got
 * whichever row Postgres felt like returning — and because the engagement outranks the
 * assignment above, one coin toss re-pointed her portal name, her thread header and her
 * care-card headshot at somebody she had never met. Priya's family saw Maya's face.
 */
const assignedDoula = readFileSync(join(process.cwd(), "src", "lib", "assigned-doula.ts"), "utf8");
const funnel = readFileSync(join(process.cwd(), "src", "lib", "funnel.ts"), "utf8");

const primaryRow = { userId: PRIYA, role: "primary", createdAt: new Date("2026-01-02") };
const backupRow = { userId: MAYA, role: "backup", createdAt: new Date("2026-03-04") };

describe("which assignment is the primary (TOK-67)", () => {
  it("picks the primary over a backup, whatever order the rows arrive in", () => {
    expect(pickPrimaryAssignment([primaryRow, backupRow])?.userId).toBe(PRIYA);
    expect(pickPrimaryAssignment([backupRow, primaryRow])?.userId).toBe(PRIYA);
  });

  it("does not let a newer backup outrank the primary", () => {
    // The backup row is four months newer. Role still wins.
    expect(backupRow.createdAt.getTime()).toBeGreaterThan(primaryRow.createdAt.getTime());
    expect(pickPrimaryAssignment([primaryRow, backupRow])?.userId).toBe(PRIYA);
  });

  it("breaks a tie between two same-role rows with the most recent one", () => {
    const older = { userId: MAYA, role: "primary", createdAt: new Date("2026-01-01") };
    const newer = { userId: PRIYA, role: "primary", createdAt: new Date("2026-06-01") };
    expect(pickPrimaryAssignment([older, newer])?.userId).toBe(PRIYA);
    expect(pickPrimaryAssignment([newer, older])?.userId).toBe(PRIYA);
  });

  it("answers null for a family nobody is on, rather than picking somebody", () => {
    expect(pickPrimaryAssignment([])).toBeNull();
  });

  it("survives a row with no timestamp instead of ordering on NaN", () => {
    const undated = { userId: MAYA, role: "primary" };
    expect(pickPrimaryAssignment([undated, primaryRow])?.userId).toBe(PRIYA);
    expect(pickPrimaryAssignment([undated])?.userId).toBe(MAYA);
  });

  it("is the one rule, used by the read path and the funnel's write path alike", () => {
    expect(assignedDoula).toContain("resolvePrimaryAssignedUserId");
    expect(funnel).toContain("resolvePrimaryAssignedUserId");
    // The unordered read that caused it must not come back.
    expect(funnel).not.toContain("const [assignment] = await db");
  });

  it("scopes the funnel's lookup to the organization, like every other read there", () => {
    expect(assignedDoula).toContain("eq(assignments.organizationId, input.organizationId)");
  });
});

/**
 * The bleed is only visible because the engagement outranks the assignment. That
 * precedence is right — but it means the *wrong* engagement value is louder than the
 * correct assignment underneath it, so nothing downstream can recover from it.
 */
describe("a wrong engagement primary is not recoverable downstream (TOK-67)", () => {
  it("shows why the write has to be correct: the engagement wins on every surface", () => {
    const doula = pickAssignedDoula({
      organizationId: NOVA,
      candidates: [
        { organizationId: NOVA, userId: MAYA, name: "Maya Chen", source: "engagement" },
        { organizationId: NOVA, userId: PRIYA, name: "Priya Raman", source: "assignment" },
      ],
    });
    expect(doula.userId).toBe(MAYA);
    // And the care card's photo is read for `doula.userId`, so name and face move together
    // — both to the wrong person. Fixing this at render time is not possible.
    expect(doula.source).toBe("engagement");
  });
});
