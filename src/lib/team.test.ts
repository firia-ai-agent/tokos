import { describe, expect, it } from "vitest";
import {
  canAssignPrimaryDoula,
  canInviteStaff,
  canManageTeam,
  createInviteToken,
  inviteExpiry,
  inviteStatus,
  inviteUrl,
  normalizeInviteRole,
  pendingInvites,
  roleLabel,
} from "./team";

const NOVA = "11111111-1111-4111-8111-111111111111";
const CEDAR = "11111111-1111-4111-8111-111111111112";

describe("roster permissions", () => {
  it("lets owners and admins manage the roster, and nobody else", () => {
    expect(canManageTeam("owner")).toBe(true);
    expect(canManageTeam("admin")).toBe(true);
    expect(canManageTeam("doula")).toBe(false);
    expect(canManageTeam(null)).toBe(false);
    expect(canManageTeam("OWNER")).toBe(false);
  });

  it("labels roles the way the shell does", () => {
    expect(roleLabel("owner")).toBe("Founder");
    expect(roleLabel("admin")).toBe("Admin");
    expect(roleLabel(undefined)).toBe("Doula");
  });
});

describe("invite role", () => {
  it("never hands out ownership by email", () => {
    expect(normalizeInviteRole("owner")).toBe("doula");
    expect(normalizeInviteRole("superuser")).toBe("doula");
    expect(normalizeInviteRole("")).toBe("doula");
  });

  it("keeps the two roles an invite may carry", () => {
    expect(normalizeInviteRole("admin")).toBe("admin");
    expect(normalizeInviteRole(" Doula ")).toBe("doula");
  });
});

describe("invite tokens", () => {
  it("is hex, long enough to be unguessable, and URL-safe", () => {
    const token = createInviteToken();
    expect(token).toMatch(/^[0-9a-f]{48}$/);
    expect(encodeURIComponent(token)).toBe(token);
  });

  it("does not repeat", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => createInviteToken()));
    expect(tokens.size).toBe(200);
  });

  it("expires seven days out by default", () => {
    const from = new Date("2026-03-01T12:00:00Z");
    expect(inviteExpiry(from).toISOString()).toBe("2026-03-08T12:00:00.000Z");
    expect(inviteExpiry(from, 1).toISOString()).toBe("2026-03-02T12:00:00.000Z");
  });

  it("builds the accept URL without doubling the slash", () => {
    expect(inviteUrl("https://tokos.app/", "abc")).toBe("https://tokos.app/invite/abc");
    expect(inviteUrl("https://tokos.app", "abc")).toBe("https://tokos.app/invite/abc");
  });
});

describe("invite status", () => {
  const now = new Date("2026-03-05T12:00:00Z");
  const live = { expiresAt: new Date("2026-03-08T12:00:00Z"), acceptedAt: null };
  const stale = { expiresAt: new Date("2026-03-01T12:00:00Z"), acceptedAt: null };
  const done = { expiresAt: new Date("2026-03-08T12:00:00Z"), acceptedAt: new Date() };

  it("reads accepted, expired, and pending apart", () => {
    expect(inviteStatus(live, now)).toBe("pending");
    expect(inviteStatus(stale, now)).toBe("expired");
    expect(inviteStatus(done, now)).toBe("accepted");
  });

  it("counts an invite expiring exactly now as expired", () => {
    expect(inviteStatus({ expiresAt: now, acceptedAt: null }, now)).toBe("expired");
  });

  it("keeps only live invites on the waiting list", () => {
    expect(pendingInvites([live, stale, done], now)).toEqual([live]);
  });
});

describe("canInviteStaff", () => {
  const base = {
    actorRole: "owner",
    email: "alex@novabirthpartners.com",
    memberEmails: ["maya@novabirthpartners.com"],
    pendingEmails: [] as string[],
  };

  it("accepts a fresh address from a manager", () => {
    expect(canInviteStaff(base)).toEqual({ ok: true });
  });

  it("refuses a doula", () => {
    expect(canInviteStaff({ ...base, actorRole: "doula" })).toEqual({ ok: false, reason: "role" });
  });

  it("refuses a malformed address", () => {
    expect(canInviteStaff({ ...base, email: "alex@" })).toEqual({ ok: false, reason: "email" });
  });

  it("refuses someone who already has a membership, whatever the casing", () => {
    expect(canInviteStaff({ ...base, email: "  MAYA@NovaBirthPartners.com " })).toEqual({
      ok: false,
      reason: "member",
    });
  });

  it("refuses a second live invite to the same address", () => {
    expect(
      canInviteStaff({ ...base, pendingEmails: ["Alex@novabirthpartners.com"] }),
    ).toEqual({ ok: false, reason: "duplicate" });
  });
});

describe("canAssignPrimaryDoula", () => {
  const base = {
    actorRole: "owner",
    actorOrganizationId: NOVA,
    clientOrganizationId: NOVA,
    memberOrganizationId: NOVA,
  };

  it("allows a manager to match inside their own org", () => {
    expect(canAssignPrimaryDoula(base)).toEqual({ ok: true });
  });

  it("refuses a doula", () => {
    expect(canAssignPrimaryDoula({ ...base, actorRole: "doula" })).toEqual({
      ok: false,
      reason: "role",
    });
  });

  it("refuses another tenant's family", () => {
    expect(canAssignPrimaryDoula({ ...base, clientOrganizationId: CEDAR })).toEqual({
      ok: false,
      reason: "client",
    });
  });

  it("refuses a doula who is not a member here", () => {
    expect(canAssignPrimaryDoula({ ...base, memberOrganizationId: null })).toEqual({
      ok: false,
      reason: "member",
    });
    expect(canAssignPrimaryDoula({ ...base, memberOrganizationId: CEDAR })).toEqual({
      ok: false,
      reason: "member",
    });
  });

  it("refuses a session with no organization at all", () => {
    expect(
      canAssignPrimaryDoula({
        ...base,
        actorOrganizationId: "",
        clientOrganizationId: "",
        memberOrganizationId: "",
      }),
    ).toEqual({ ok: false, reason: "org" });
  });
});
