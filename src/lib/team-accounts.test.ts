import { describe, expect, it } from "vitest";
import {
  familyAccounts,
  familyLocation,
  groupTeamAccounts,
  inviteDisplayName,
  parseAddTeamMember,
  portalStatus,
  teamAccounts,
  type RosterMember,
  type StaffInvite,
} from "./team-accounts";

const NOW = new Date("2026-09-10T12:00:00Z");

function member(overrides: Partial<RosterMember> & Pick<RosterMember, "name" | "email">): RosterMember {
  return {
    membershipId: `m-${overrides.email}`,
    userId: `u-${overrides.email}`,
    role: "doula",
    credentialsLabel: null,
    joinedAt: new Date("2026-01-01T00:00:00Z"),
    primaryClients: 0,
    ...overrides,
  };
}

function invite(overrides: Partial<StaffInvite> & Pick<StaffInvite, "email">): StaffInvite {
  return {
    id: `i-${overrides.email}`,
    role: "doula",
    token: `t-${overrides.email}`,
    expiresAt: new Date("2026-09-17T12:00:00Z"),
    ...overrides,
  };
}

describe("team accounts", () => {
  it("puts joined people and invited people on one list with a status each", () => {
    const accounts = teamAccounts({
      members: [member({ name: "Maya Chen", email: "maya@nova.com", role: "owner" })],
      invites: [invite({ email: "alex@nova.com", name: "Alex Ruiz" })],
      now: NOW,
    });
    expect(accounts.map((a) => [a.name, a.status])).toEqual([
      ["Maya Chen", "active"],
      ["Alex Ruiz", "pending"],
    ]);
  });

  it("marks a lapsed invite expired rather than leaving an owner waiting", () => {
    const accounts = teamAccounts({
      members: [],
      invites: [invite({ email: "alex@nova.com", expiresAt: new Date("2026-09-01T00:00:00Z") })],
      now: NOW,
    });
    expect(accounts[0].status).toBe("expired");
  });

  it("does not show someone twice once they accept", () => {
    const accounts = teamAccounts({
      members: [member({ name: "Priya Raman", email: "Priya@nova.com" })],
      invites: [
        invite({ email: "priya@nova.com", acceptedAt: new Date("2026-02-01T00:00:00Z") }),
        // Belt and braces: an unaccepted invite for someone already on the roster.
        invite({ id: "i-dup", email: "PRIYA@nova.com" }),
      ],
      now: NOW,
    });
    expect(accounts).toHaveLength(1);
    expect(accounts[0].source).toBe("member");
  });

  it("sorts active before pending, then founder before doula", () => {
    const accounts = teamAccounts({
      members: [
        member({ name: "Priya Raman", email: "priya@nova.com", role: "doula" }),
        member({ name: "Maya Chen", email: "maya@nova.com", role: "owner" }),
      ],
      invites: [invite({ email: "alex@nova.com", role: "admin" })],
      now: NOW,
    });
    expect(accounts.map((a) => a.name)).toEqual(["Maya Chen", "Priya Raman", "alex"]);
  });

  it("names an invite from the address when nobody typed a name", () => {
    expect(inviteDisplayName(invite({ email: "alex@nova.com" }))).toBe("alex");
    expect(inviteDisplayName(invite({ email: "alex@nova.com", name: " Alex Ruiz " }))).toBe(
      "Alex Ruiz",
    );
  });

  it("splits the grid into active and pending blocks", () => {
    const groups = groupTeamAccounts(
      teamAccounts({
        members: [member({ name: "Maya Chen", email: "maya@nova.com", role: "owner" })],
        invites: [
          invite({ email: "alex@nova.com" }),
          invite({ id: "i-old", email: "old@nova.com", expiresAt: new Date("2026-01-01T00:00:00Z") }),
        ],
        now: NOW,
      }),
    );
    expect(groups.active).toHaveLength(1);
    expect(groups.pending).toHaveLength(1);
    expect(groups.expired).toHaveLength(1);
  });
});

describe("family portal status", () => {
  it("only calls a portal active when a real login is behind it", () => {
    expect(portalStatus({ status: "active", userId: "u1" })).toBe("active");
    expect(portalStatus({ status: "active", userId: null })).toBe("pending");
    expect(portalStatus({ status: "invited", userId: null })).toBe("pending");
    expect(portalStatus(null)).toBe("none");
    expect(portalStatus({ status: "revoked", userId: "u1" })).toBe("none");
  });
});

describe("family accounts", () => {
  const base = {
    email: "j@example.com",
    phone: null,
    edd: null,
    city: null,
    region: null,
    postalCode: null,
    serviceType: null,
    stage: null,
    primaryDoulaName: null,
    access: null,
  };

  it("floats families with no doula to the top", () => {
    const rows = familyAccounts([
      { ...base, clientId: "c1", name: "Avery Kim", primaryDoulaUserId: "u1" },
      { ...base, clientId: "c2", name: "Jordan Rivera", primaryDoulaUserId: null },
    ]);
    expect(rows.map((row) => row.name)).toEqual(["Jordan Rivera", "Avery Kim"]);
    expect(rows[0].matched).toBe(false);
  });

  it("carries the portal status and a readable location", () => {
    const [row] = familyAccounts([
      {
        ...base,
        clientId: "c1",
        name: "Jordan Rivera",
        city: "Arlington",
        region: "VA",
        postalCode: "22201",
        primaryDoulaUserId: null,
        access: { status: "active", userId: "u9" },
      },
    ]);
    expect(row.portal).toBe("active");
    expect(row.location).toBe("Arlington, VA 22201");
  });

  it("builds whatever of the location it holds without stray commas", () => {
    expect(familyLocation({ city: "Arlington" })).toBe("Arlington");
    expect(familyLocation({ region: "VA", postalCode: "22201" })).toBe("VA 22201");
    expect(familyLocation({})).toBe("");
  });
});

describe("the add-team-member popup", () => {
  it("takes a name, a work email and a role", () => {
    expect(parseAddTeamMember({ name: "  Alex   Ruiz ", email: " Alex@NOVA.com ", role: "admin" })).toEqual(
      { ok: true, value: { name: "Alex Ruiz", email: "alex@nova.com", role: "admin" } },
    );
  });

  it("refuses a nameless card and a broken address", () => {
    expect(parseAddTeamMember({ name: "", email: "a@b.com", role: "doula" })).toEqual({
      ok: false,
      reason: "name",
    });
    expect(parseAddTeamMember({ name: "Alex", email: "not-an-email", role: "doula" })).toEqual({
      ok: false,
      reason: "email",
    });
  });

  it("cannot hand out ownership from the popup either", () => {
    const parsed = parseAddTeamMember({ name: "Alex", email: "a@b.com", role: "owner" });
    expect(parsed.ok && parsed.value.role).toBe("doula");
  });
});
