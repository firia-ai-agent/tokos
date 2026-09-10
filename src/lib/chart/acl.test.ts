import { describe, expect, it } from "vitest";

import {
  BREAK_GLASS_CAPABILITIES,
  BREAK_GLASS_MIN_REASON_LENGTH,
  CHART_CAPABILITIES,
  SHAREABLE_POLICIES,
  canSetSharePolicy,
  chartAccess,
  chartRelationship,
  isSharedWithClient,
  type ChartCapability,
  type ChartCareTeam,
} from "./acl";
import { CHART_DOCUMENT_KEYS } from "./field-defs";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "11111111-1111-4111-8111-111111111112";
const CLIENT = "44444444-4444-4444-8444-444444444444";

const MAYA = "22222222-2222-4222-8222-222222222222";
const PRIYA = "22222222-2222-4222-8222-222222222224";
const CO_DOULA = "22222222-2222-4222-8222-222222222225";
const STRANGER = "22222222-2222-4222-8222-222222222226";
const OWNER = "22222222-2222-4222-8222-222222222227";

const record = { organizationId: ORG, clientId: CLIENT };

/** Avery's team on the seed: Maya primary, Priya backing her up, plus a co-doula. */
const careTeam: ChartCareTeam = {
  primaryDoulaUserId: MAYA,
  assignments: [
    { userId: MAYA, role: "primary", status: "active", organizationId: ORG },
    { userId: PRIYA, role: "backup", status: "active", organizationId: ORG },
    { userId: CO_DOULA, role: "co", status: "active", organizationId: ORG },
  ],
};

const staff = (userId: string, membershipRole = "doula") => ({
  organizationId: ORG,
  userId,
  membershipRole,
});

function decide(
  userId: string,
  capability: ChartCapability,
  options: { membershipRole?: string; breakGlassReason?: string; organizationId?: string } = {},
) {
  return chartAccess({
    actor: {
      ...staff(userId, options.membershipRole ?? "doula"),
      organizationId: options.organizationId ?? ORG,
    },
    record,
    careTeam,
    capability,
    breakGlassReason: options.breakGlassReason,
  });
}

describe("chart ACL — who may open a chart (TOK-45, Faith K2)", () => {
  it("lets the assigned doula in for everything", () => {
    for (const capability of CHART_CAPABILITIES) {
      const decision = decide(MAYA, capability);
      expect(decision.allowed, capability).toBe(true);
      expect(decision.relationship).toBe("primary_doula");
      expect(decision.breakGlass).toBe(false);
      expect(decision.reason).toBe("granted");
    }
  });

  it("lets an owner and an admin in even with no assignment at all", () => {
    for (const role of ["owner", "admin"]) {
      for (const capability of CHART_CAPABILITIES) {
        const decision = decide(OWNER, capability, { membershipRole: role });
        expect(decision.allowed, `${role} ${capability}`).toBe(true);
        expect(decision.relationship).toBe("owner_admin");
      }
    }
  });

  it("lets the backup read and write, and no further", () => {
    expect(decide(PRIYA, "read").allowed).toBe(true);
    expect(decide(PRIYA, "write").allowed).toBe(true);
    expect(chartRelationship({ actor: staff(PRIYA), record, careTeam })).toBe("backup");

    // Being in the room is not permission to hand the room to the family.
    const share = decide(PRIYA, "share");
    expect(share.allowed).toBe(false);
    expect(share.reason).toBe("capability");
    expect(decide(PRIYA, "export").allowed).toBe(false);
  });

  it("reads on-call as a backup, whichever way the role was typed", () => {
    for (const role of ["on_call", "on-call", "ON CALL"]) {
      const relationship = chartRelationship({
        actor: staff(PRIYA),
        record,
        careTeam: { assignments: [{ userId: PRIYA, role, status: "active" }] },
      });
      expect(relationship, role).toBe("backup");
    }
  });

  it("counts a co-doula as care team", () => {
    expect(chartRelationship({ actor: staff(CO_DOULA), record, careTeam })).toBe("co_doula");
    expect(decide(CO_DOULA, "share").allowed).toBe(true);
  });

  it("refuses other staff in the same practice", () => {
    const decision = decide(STRANGER, "read");
    expect(decision.allowed).toBe(false);
    expect(decision.relationship).toBe("outsider");
    expect(decision.reason).toBe("relationship");
    expect(decision.breakGlass).toBe(false);
  });

  it("refuses another practice before it looks at any roster", () => {
    const decision = decide(MAYA, "read", { organizationId: OTHER_ORG });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("tenant");
    expect(decision.relationship).toBe("outsider");
  });

  it("ignores a closed assignment", () => {
    const relationship = chartRelationship({
      actor: staff(PRIYA),
      record,
      careTeam: { assignments: [{ userId: PRIYA, role: "backup", status: "ended" }] },
    });
    expect(relationship).toBe("outsider");
  });

  it("ignores an assignment row from another practice", () => {
    const relationship = chartRelationship({
      actor: staff(PRIYA),
      record,
      careTeam: {
        assignments: [
          { userId: PRIYA, role: "primary", status: "active", organizationId: OTHER_ORG },
        ],
      },
    });
    expect(relationship).toBe("outsider");
  });

  it("does not invent a care-team role out of an unknown assignment string", () => {
    const relationship = chartRelationship({
      actor: staff(STRANGER),
      record,
      careTeam: { assignments: [{ userId: STRANGER, role: "observer", status: "active" }] },
    });
    expect(relationship).toBe("outsider");
  });
});

describe("break-glass (TOK-45, Faith K2)", () => {
  const REASON = "On call for Maya overnight";

  it("opens the chart for an outsider who types a reason", () => {
    const decision = decide(STRANGER, "read", { breakGlassReason: REASON });
    expect(decision.allowed).toBe(true);
    expect(decision.breakGlass).toBe(true);
    expect(decision.reason).toBe("break_glass");
    expect(decision.relationship).toBe("outsider");
  });

  it("refuses a reason too short to be one", () => {
    const decision = decide(STRANGER, "read", { breakGlassReason: "x" });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("break_glass_reason");
    expect("x".length).toBeLessThan(BREAK_GLASS_MIN_REASON_LENGTH);
  });

  it("never widens past read, whatever the reason says", () => {
    expect(BREAK_GLASS_CAPABILITIES).toEqual(["read"]);
    for (const capability of ["write", "share", "export"] as const) {
      const decision = decide(STRANGER, capability, { breakGlassReason: REASON });
      expect(decision.allowed, capability).toBe(false);
      expect(decision.breakGlass).toBe(false);
    }
  });

  it("does not let a reason cross a tenant boundary", () => {
    const decision = decide(STRANGER, "read", {
      breakGlassReason: REASON,
      organizationId: OTHER_ORG,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("tenant");
  });
});

describe("share policy transitions (TOK-45, Faith K1)", () => {
  const shareAccess = decide(MAYA, "share");

  it("opens a signed care plan to the family", () => {
    expect(
      canSetSharePolicy({
        document: "care_plan",
        policy: "preferences_shareable",
        status: "signed",
        access: shareAccess,
      }),
    ).toEqual({ ok: true });
  });

  it("refuses to share a care plan nobody signed", () => {
    expect(
      canSetSharePolicy({
        document: "care_plan",
        policy: "preferences_shareable",
        status: "draft",
        access: shareAccess,
      }),
    ).toEqual({ ok: false, reason: "unsigned" });
  });

  it("never opens a visit note to a family", () => {
    for (const document of ["prenatal_visit", "postpartum_visit"] as const) {
      expect(SHAREABLE_POLICIES[document]).toEqual(["staff_only"]);
      expect(
        canSetSharePolicy({
          document,
          policy: "preferences_shareable",
          status: "signed",
          access: shareAccess,
        }),
      ).toEqual({ ok: false, reason: "document" });
    }
  });

  it("lets a birth log reach a shared summary and nothing beyond it", () => {
    expect(SHAREABLE_POLICIES.birth_log).toEqual(["staff_only", "shared_summary"]);
    expect(
      canSetSharePolicy({
        document: "birth_log",
        policy: "shared_summary",
        status: "signed",
        access: shareAccess,
      }),
    ).toEqual({ ok: true });
    expect(
      canSetSharePolicy({
        document: "birth_log",
        policy: "preferences_shareable",
        status: "signed",
        access: shareAccess,
      }),
    ).toEqual({ ok: false, reason: "document" });
  });

  it("rejects a policy string no one reviewed", () => {
    expect(
      canSetSharePolicy({
        document: "care_plan",
        policy: "public",
        status: "signed",
        access: shareAccess,
      }),
    ).toEqual({ ok: false, reason: "policy" });
  });

  it("lets every document be closed again, signed or not", () => {
    for (const document of CHART_DOCUMENT_KEYS) {
      expect(
        canSetSharePolicy({
          document,
          policy: "staff_only",
          status: "draft",
          access: shareAccess,
        }),
      ).toEqual({ ok: true });
    }
  });

  it("refuses a share the ACL did not grant", () => {
    expect(
      canSetSharePolicy({
        document: "care_plan",
        policy: "preferences_shareable",
        status: "signed",
        access: decide(PRIYA, "share"),
      }),
    ).toEqual({ ok: false, reason: "capability" });

    // A read grant is not a share grant, even though it was allowed.
    expect(
      canSetSharePolicy({
        document: "care_plan",
        policy: "preferences_shareable",
        status: "signed",
        access: decide(MAYA, "read"),
      }),
    ).toEqual({ ok: false, reason: "capability" });
  });
});

describe("isSharedWithClient", () => {
  it("needs both a signature and an open policy", () => {
    expect(isSharedWithClient({ status: "signed", sharePolicy: "preferences_shareable" })).toBe(
      true,
    );
    expect(isSharedWithClient({ status: "amended", sharePolicy: "shared_summary" })).toBe(true);
    expect(isSharedWithClient({ status: "draft", sharePolicy: "preferences_shareable" })).toBe(
      false,
    );
    expect(isSharedWithClient({ status: "signed", sharePolicy: "staff_only" })).toBe(false);
    expect(isSharedWithClient({ status: "signed", sharePolicy: "public" })).toBe(false);
  });
});
