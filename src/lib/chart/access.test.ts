import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The enforcement path, with the database faked out (TOK-45).
 *
 * `acl.test.ts` proves the rules; this file proves they are actually run and actually
 * written down. Every assertion here is about a row that must or must not appear in
 * `audit_logs` — a denial nobody logged is indistinguishable from a request nobody made.
 */

const ORG = "11111111-1111-4111-8111-111111111111";
const CLIENT = "44444444-4444-4444-8444-444444444444";
const ENGAGEMENT = "55555555-5555-4555-8555-555555555555";
const MAYA = "22222222-2222-4222-8222-222222222222";
const PRIYA = "22222222-2222-4222-8222-222222222224";
const STRANGER = "22222222-2222-4222-8222-222222222226";
const CARE_PLAN_ID = "66666666-6666-4666-8666-666666666666";
const BIRTH_LOG_ID = "77777777-7777-4777-8777-777777777777";

const fixtures = vi.hoisted(() => ({
  rows: new Map<string, Record<string, unknown>[]>(),
  updates: [] as { table: string; values: Record<string, unknown> }[],
  writeAudit: vi.fn(async () => {}),
}));

vi.mock("@/lib/audit", () => ({ writeAudit: fixtures.writeAudit }));

/** A drizzle-shaped stub: every builder resolves to whatever rows the test seeded. */
vi.mock("@/db", async () => {
  const { getTableName } = await import("drizzle-orm");
  type Table = Parameters<typeof getTableName>[0];
  const resolve = (table: Table) => {
    const result = fixtures.rows.get(getTableName(table)) ?? [];
    const chain: Record<string, unknown> = {};
    for (const method of ["where", "orderBy", "limit", "innerJoin"]) {
      chain[method] = () => chain;
    }
    chain.then = (onFulfilled: (value: unknown) => unknown, onRejected?: () => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected);
    return chain;
  };
  return {
    getDb: () => ({
      select: () => ({ from: resolve }),
      update: (table: Table) => ({
        set: (values: Record<string, unknown>) => ({
          where: async () => {
            fixtures.updates.push({ table: getTableName(table), values });
          },
        }),
      }),
    }),
  };
});

const {
  authorizeChartAccess,
  exportChartRecord,
  requireChartAccess,
  setChartSharePolicy,
} = await import("./access");
const { CHART_AUDIT_ACTIONS } = await import("./audit-actions");

type AuditCall = {
  organizationId: string;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, string>;
};

const auditCalls = (): AuditCall[] =>
  fixtures.writeAudit.mock.calls.map((call) => (call as unknown as [AuditCall])[0]);

const staff = (userId: string, membershipRole = "doula") => ({
  organizationId: ORG,
  userId,
  membershipRole,
});

const carePlanRow = (overrides: Record<string, unknown> = {}) => ({
  id: CARE_PLAN_ID,
  organizationId: ORG,
  clientId: CLIENT,
  engagementId: ENGAGEMENT,
  status: "signed",
  version: 1,
  sharePolicy: "staff_only",
  signedAt: new Date("2026-08-01T15:00:00.000Z"),
  answers: { medication_code_word: "pineapple", know_gender: "surprise" },
  ...overrides,
});

const birthLogRow = (overrides: Record<string, unknown> = {}) => ({
  id: BIRTH_LOG_ID,
  organizationId: ORG,
  clientId: CLIENT,
  engagementId: ENGAGEMENT,
  status: "signed",
  version: 1,
  sharePolicy: "shared_summary",
  signedAt: new Date("2026-08-02T04:00:00.000Z"),
  answers: {
    baby_name: "Wren",
    degree_of_tearing: "second",
    apgar_five_minute: 9,
    labor_grid: [{ time: "02:10", dilation: "6" }],
  },
  ...overrides,
});

beforeEach(() => {
  fixtures.writeAudit.mockClear();
  fixtures.updates.length = 0;
  fixtures.rows.clear();
  fixtures.rows.set("engagements", [{ id: ENGAGEMENT, primaryDoulaUserId: MAYA }]);
  fixtures.rows.set("assignments", [
    { userId: MAYA, role: "primary", status: "active", organizationId: ORG },
    { userId: PRIYA, role: "backup", status: "active", organizationId: ORG },
  ]);
  fixtures.rows.set("care_plans", [carePlanRow()]);
  fixtures.rows.set("birth_logs", [birthLogRow()]);
});

describe("requireChartAccess (TOK-45)", () => {
  it("opens the chart for the assigned doula and logs the view", async () => {
    const { decision } = await requireChartAccess({
      actor: staff(MAYA),
      document: "care_plan",
      recordId: CARE_PLAN_ID,
      capability: "read",
    });
    expect(decision.allowed).toBe(true);

    const [audit] = auditCalls();
    expect(audit.action).toBe(CHART_AUDIT_ACTIONS.viewed);
    expect(audit.entityType).toBe("care_plan");
    expect(audit.entityId).toBe(CARE_PLAN_ID);
    expect(audit.actorUserId).toBe(MAYA);
    expect(audit.metadata?.relationship).toBe("primary_doula");
    expect(audit.metadata?.capability).toBe("read");
  });

  it("opens it for the backup too", async () => {
    const { decision } = await requireChartAccess({
      actor: staff(PRIYA),
      document: "care_plan",
      recordId: CARE_PLAN_ID,
      capability: "read",
    });
    expect(decision.relationship).toBe("backup");
    expect(auditCalls()[0].action).toBe(CHART_AUDIT_ACTIONS.viewed);
  });

  it("refuses an outsider and writes the denial down", async () => {
    await expect(
      requireChartAccess({
        actor: staff(STRANGER),
        document: "care_plan",
        recordId: CARE_PLAN_ID,
        capability: "read",
      }),
    ).rejects.toThrow("Forbidden");

    const [audit] = auditCalls();
    expect(audit.action).toBe(CHART_AUDIT_ACTIONS.accessDenied);
    expect(audit.entityId).toBe(CARE_PLAN_ID);
    expect(audit.metadata?.deny_reason).toBe("relationship");
    expect(audit.metadata?.relationship).toBe("outsider");
  });

  it("lets an outsider break glass with a typed reason, audited as break-glass", async () => {
    const reason = "On call for Maya overnight";
    const { decision } = await requireChartAccess({
      actor: staff(STRANGER),
      document: "care_plan",
      recordId: CARE_PLAN_ID,
      capability: "read",
      breakGlassReason: reason,
    });
    expect(decision.breakGlass).toBe(true);

    const [audit] = auditCalls();
    expect(audit.action).toBe(CHART_AUDIT_ACTIONS.breakGlass);
    expect(audit.metadata?.reason).toBe(reason);
    // Never doubled as an ordinary view — the trail must say how the door opened.
    expect(auditCalls().some((call) => call.action === CHART_AUDIT_ACTIONS.viewed)).toBe(false);
  });

  it("refuses a chart that is not this practice's, without reading a roster", async () => {
    fixtures.rows.set("care_plans", []);
    await expect(
      requireChartAccess({
        actor: staff(MAYA, "owner"),
        document: "care_plan",
        recordId: CARE_PLAN_ID,
        capability: "read",
      }),
    ).rejects.toThrow("Forbidden");

    const [audit] = auditCalls();
    expect(audit.action).toBe(CHART_AUDIT_ACTIONS.accessDenied);
    expect(audit.metadata?.deny_reason).toBe("tenant");
  });
});

describe("authorizeChartAccess audit shape (TOK-45)", () => {
  it("leaves a granted write to the write itself to record", async () => {
    const decision = await authorizeChartAccess({
      actor: staff(MAYA),
      document: "care_plan",
      record: carePlanRow(),
      careTeam: { primaryDoulaUserId: MAYA },
      capability: "write",
    });
    expect(decision.allowed).toBe(true);
    expect(fixtures.writeAudit).not.toHaveBeenCalled();
  });

  it("keeps a denied reason out of the metadata it did not ask for", async () => {
    await authorizeChartAccess({
      actor: staff(STRANGER),
      document: "birth_log",
      record: birthLogRow(),
      careTeam: { primaryDoulaUserId: MAYA },
      capability: "read",
      breakGlassReason: "no",
    });
    const [audit] = auditCalls();
    expect(audit.action).toBe(CHART_AUDIT_ACTIONS.accessDenied);
    expect(audit.metadata?.deny_reason).toBe("break_glass_reason");
    expect(audit.metadata?.reason).toBeUndefined();
  });
});

describe("setChartSharePolicy (TOK-45, Faith K1)", () => {
  it("opens a signed care plan to the family and audits the share", async () => {
    const result = await setChartSharePolicy({
      actor: staff(MAYA),
      document: "care_plan",
      recordId: CARE_PLAN_ID,
      policy: "preferences_shareable",
    });
    expect(result.policy).toBe("preferences_shareable");
    expect(fixtures.updates).toEqual([
      { table: "care_plans", values: { sharePolicy: "preferences_shareable" } },
    ]);

    const audit = auditCalls().at(-1)!;
    expect(audit.action).toBe(CHART_AUDIT_ACTIONS.shared);
    expect(audit.metadata?.share_policy).toBe("preferences_shareable");
    expect(audit.metadata?.relationship).toBe("primary_doula");
  });

  it("audits a revoke as a revoke", async () => {
    fixtures.rows.set("care_plans", [carePlanRow({ sharePolicy: "preferences_shareable" })]);
    await setChartSharePolicy({
      actor: staff(MAYA, "owner"),
      document: "care_plan",
      recordId: CARE_PLAN_ID,
      policy: "staff_only",
    });
    expect(auditCalls().at(-1)!.action).toBe(CHART_AUDIT_ACTIONS.shareRevoked);
  });

  it("refuses to share an unsigned plan, and writes that refusal down", async () => {
    fixtures.rows.set("care_plans", [carePlanRow({ status: "draft", signedAt: null })]);
    await expect(
      setChartSharePolicy({
        actor: staff(MAYA),
        document: "care_plan",
        recordId: CARE_PLAN_ID,
        policy: "preferences_shareable",
      }),
    ).rejects.toThrow("Forbidden");

    expect(fixtures.updates).toEqual([]);
    const audit = auditCalls().at(-1)!;
    expect(audit.action).toBe(CHART_AUDIT_ACTIONS.accessDenied);
    expect(audit.metadata?.deny_reason).toBe("unsigned");
  });

  it("refuses a backup's share before it ever reaches the policy table", async () => {
    await expect(
      setChartSharePolicy({
        actor: staff(PRIYA),
        document: "care_plan",
        recordId: CARE_PLAN_ID,
        policy: "preferences_shareable",
      }),
    ).rejects.toThrow("Forbidden");
    expect(fixtures.updates).toEqual([]);
    expect(auditCalls().at(-1)!.metadata?.deny_reason).toBe("capability");
  });

  it("refuses to open a birth log past a shared summary", async () => {
    await expect(
      setChartSharePolicy({
        actor: staff(MAYA),
        document: "birth_log",
        recordId: BIRTH_LOG_ID,
        policy: "preferences_shareable",
      }),
    ).rejects.toThrow("Forbidden");
    expect(fixtures.updates).toEqual([]);
    expect(auditCalls().at(-1)!.metadata?.deny_reason).toBe("document");
  });
});

describe("exportChartRecord (TOK-45)", () => {
  it("hands staff the whole record and audits the export", async () => {
    const { answers } = await exportChartRecord({
      actor: staff(MAYA),
      document: "birth_log",
      recordId: BIRTH_LOG_ID,
      audience: "staff",
    });
    expect(answers.degree_of_tearing).toBe("second");
    const audit = auditCalls().at(-1)!;
    expect(audit.action).toBe(CHART_AUDIT_ACTIONS.exported);
    expect(audit.metadata?.audience).toBe("staff");
  });

  it("strips the clinical grid out of an export meant for a family", async () => {
    const { answers } = await exportChartRecord({
      actor: staff(MAYA),
      document: "birth_log",
      recordId: BIRTH_LOG_ID,
      audience: "client",
    });
    expect(answers.baby_name).toBe("Wren");
    expect(answers).not.toHaveProperty("degree_of_tearing");
    expect(answers).not.toHaveProperty("apgar_five_minute");
    expect(answers).not.toHaveProperty("labor_grid");
    expect(auditCalls().at(-1)!.metadata?.audience).toBe("client");
  });

  it("does not let break-glass reach an export", async () => {
    await expect(
      exportChartRecord({
        actor: staff(STRANGER),
        document: "birth_log",
        recordId: BIRTH_LOG_ID,
        audience: "client",
        breakGlassReason: "On call for Maya overnight",
      }),
    ).rejects.toThrow("Forbidden");
    expect(auditCalls().at(-1)!.action).toBe(CHART_AUDIT_ACTIONS.accessDenied);
  });
});
