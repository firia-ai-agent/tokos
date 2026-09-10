/**
 * The only way into a chart row (TOK-45).
 *
 * `lib/chart/acl` decides; this file enforces. Every read, share and export goes through
 * one of these functions, which means the ACL runs in the query layer rather than in
 * whichever page happened to render a link — a server action is reachable by direct POST
 * and a route handler by direct GET, so a UI-only check is not a check.
 *
 * Three things every path here does, in this order:
 *  1. Reads the row scoped to the actor's organization, so a chart in another practice is
 *     not found rather than denied.
 *  2. Runs `chartAccess` against the family's real care team.
 *  3. Writes the decision to `audit_logs` — `chart.access_denied` on a refusal,
 *     `chart.break_glass` when a typed reason is what opened the row, `chart.viewed` on an
 *     ordinary read.
 *
 * Writes, shares and exports audit their own action *after* the effect lands
 * (`chart.updated`, `chart.shared`, `chart.exported`), because an audit row claiming a
 * share that then failed to commit is worse than no row at all.
 */

import { cache } from "react";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { assignments, birthLogs, carePlans, engagements, visitNotes } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import {
  CHART_AUDIT_ACTIONS,
  CHART_DOCUMENT_ENTITY_TYPES,
  chartAuditMetadata,
} from "@/lib/chart/audit-actions";
import {
  canSetSharePolicy,
  chartAccess,
  type ChartAccessDecision,
  type ChartAclActor,
  type ChartCapability,
  type ChartCareTeam,
} from "@/lib/chart/acl";
import type { ChartAnswers, ChartDocumentKey } from "@/lib/chart/field-defs";
import { clientVisibleAnswers, passportEntries, type PassportEntry } from "@/lib/chart/passport";
import { DEFAULT_SHARE_POLICY, type SharePolicy } from "@/lib/chart/share-policy";

/** The chart columns every decision and every audit row needs, whichever table it came from. */
export type ChartRecord = {
  id: string;
  organizationId: string;
  clientId: string;
  engagementId: string | null;
  status: string;
  version: number;
  sharePolicy: string;
  signedAt: Date | null;
  answers: ChartAnswers;
};

export type ChartRecordRef = {
  document: ChartDocumentKey;
  recordId: string;
};

/** What the session already knows about the actor — see `StaffSession` in `lib/tenancy`. */
export type ChartActor = ChartAclActor;

const VISIT_NOTE_KIND_BY_DOCUMENT: Partial<Record<ChartDocumentKey, string>> = {
  prenatal_visit: "prenatal",
  postpartum_visit: "postpartum",
};

const CHART_COLUMNS = {
  visitNotes: {
    id: visitNotes.id,
    organizationId: visitNotes.organizationId,
    clientId: visitNotes.clientId,
    engagementId: visitNotes.engagementId,
    status: visitNotes.status,
    version: visitNotes.version,
    sharePolicy: visitNotes.sharePolicy,
    signedAt: visitNotes.signedAt,
    answers: visitNotes.answers,
  },
  birthLogs: {
    id: birthLogs.id,
    organizationId: birthLogs.organizationId,
    clientId: birthLogs.clientId,
    engagementId: birthLogs.engagementId,
    status: birthLogs.status,
    version: birthLogs.version,
    sharePolicy: birthLogs.sharePolicy,
    signedAt: birthLogs.signedAt,
    answers: birthLogs.answers,
  },
  carePlans: {
    id: carePlans.id,
    organizationId: carePlans.organizationId,
    clientId: carePlans.clientId,
    engagementId: carePlans.engagementId,
    status: carePlans.status,
    version: carePlans.version,
    sharePolicy: carePlans.sharePolicy,
    signedAt: carePlans.signedAt,
    answers: carePlans.answers,
  },
} as const;

/**
 * One chart row by id, scoped to the organization asking. Returns null for a row in
 * another practice, a row of the wrong kind, or a row that is not there — three cases the
 * caller must not be able to tell apart.
 */
export async function readChartRecord(
  document: ChartDocumentKey,
  organizationId: string,
  recordId: string,
): Promise<ChartRecord | null> {
  if (!organizationId || !recordId) return null;
  const db = getDb();

  if (document === "birth_log") {
    const [row] = await db
      .select(CHART_COLUMNS.birthLogs)
      .from(birthLogs)
      .where(and(eq(birthLogs.id, recordId), eq(birthLogs.organizationId, organizationId)))
      .limit(1);
    return row ?? null;
  }
  if (document === "care_plan") {
    const [row] = await db
      .select(CHART_COLUMNS.carePlans)
      .from(carePlans)
      .where(and(eq(carePlans.id, recordId), eq(carePlans.organizationId, organizationId)))
      .limit(1);
    return row ?? null;
  }
  const [row] = await db
    .select(CHART_COLUMNS.visitNotes)
    .from(visitNotes)
    .where(
      and(
        eq(visitNotes.id, recordId),
        eq(visitNotes.organizationId, organizationId),
        eq(visitNotes.kind, VISIT_NOTE_KIND_BY_DOCUMENT[document] ?? ""),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * The family's care team: who the engagement names, and who is actively assigned. Cached
 * for the render, because a page that opens three chart rows should ask once.
 */
export const loadChartCareTeam = cache(async function loadChartCareTeam({
  organizationId,
  clientId,
  engagementId,
}: {
  organizationId: string;
  clientId: string;
  engagementId?: string | null;
}): Promise<ChartCareTeam> {
  const db = getDb();

  // The record's own engagement names its primary; without one, the newest engagement is
  // the family's current arrangement — the same precedence `resolveAssignedDoulaName` uses.
  const engagementRows = await db
    .select({
      id: engagements.id,
      primaryDoulaUserId: engagements.primaryDoulaUserId,
    })
    .from(engagements)
    .where(
      and(
        eq(engagements.organizationId, organizationId),
        eq(engagements.clientId, clientId),
      ),
    )
    .orderBy(desc(engagements.createdAt));

  const matched = engagementId
    ? engagementRows.find((row) => row.id === engagementId)
    : undefined;
  const primary = (matched ?? engagementRows[0])?.primaryDoulaUserId ?? null;

  const assignmentRows = await db
    .select({
      userId: assignments.userId,
      role: assignments.role,
      status: assignments.status,
      organizationId: assignments.organizationId,
    })
    .from(assignments)
    .where(
      and(
        eq(assignments.organizationId, organizationId),
        eq(assignments.clientId, clientId),
        eq(assignments.status, "active"),
      ),
    );

  return { primaryDoulaUserId: primary, assignments: assignmentRows };
});

/**
 * Decide and audit, with the rows already read. Split out from `requireChartAccess` so the
 * enforcement path — including what lands in `audit_logs` — is testable without a database.
 * Never throws: the caller decides what a denial costs.
 */
export async function authorizeChartAccess(input: {
  actor: ChartActor;
  document: ChartDocumentKey;
  record: ChartRecord;
  careTeam: ChartCareTeam;
  capability: ChartCapability;
  breakGlassReason?: string | null;
}): Promise<ChartAccessDecision> {
  const decision = chartAccess({
    actor: input.actor,
    record: input.record,
    careTeam: input.careTeam,
    capability: input.capability,
    breakGlassReason: input.breakGlassReason,
  });
  const entityType = CHART_DOCUMENT_ENTITY_TYPES[input.document];

  const action = !decision.allowed
    ? CHART_AUDIT_ACTIONS.accessDenied
    : decision.breakGlass
      ? CHART_AUDIT_ACTIONS.breakGlass
      : input.capability === "read"
        ? CHART_AUDIT_ACTIONS.viewed
        : null;

  if (action) {
    await writeAudit({
      organizationId: input.record.organizationId,
      actorUserId: input.actor.userId,
      action,
      entityType,
      entityId: input.record.id,
      metadata: chartAuditMetadata({
        entityType,
        clientId: input.record.clientId,
        engagementId: input.record.engagementId ?? undefined,
        version: input.record.version,
        sharePolicy: input.record.sharePolicy,
        capability: input.capability,
        relationship: decision.relationship,
        denyReason: decision.allowed ? undefined : decision.reason,
        // Only a break-glass reason is stored. A denial's reason code says enough.
        reason: decision.breakGlass
          ? String(input.breakGlassReason ?? "").trim()
          : undefined,
      }),
    });
  }

  return decision;
}

/**
 * Open a chart row for one capability, or throw. This is the function pages, server actions
 * and route handlers call; there is no supported path that reads a chart table directly.
 */
export async function requireChartAccess(input: {
  actor: ChartActor;
  document: ChartDocumentKey;
  recordId: string;
  capability: ChartCapability;
  breakGlassReason?: string | null;
}): Promise<{ record: ChartRecord; decision: ChartAccessDecision }> {
  const record = await readChartRecord(
    input.document,
    input.actor.organizationId,
    input.recordId,
  );
  const entityType = CHART_DOCUMENT_ENTITY_TYPES[input.document];

  if (!record) {
    // Nothing to scope the audit row to but the actor's own org and the id they asked for
    // — which is exactly the fact worth keeping: someone reached for a chart not theirs.
    await writeAudit({
      organizationId: input.actor.organizationId,
      actorUserId: input.actor.userId,
      action: CHART_AUDIT_ACTIONS.accessDenied,
      entityType,
      entityId: input.recordId,
      metadata: chartAuditMetadata({
        entityType,
        capability: input.capability,
        relationship: "outsider",
        denyReason: "tenant",
      }),
    });
    throw new Error("Forbidden");
  }

  const careTeam = await loadChartCareTeam({
    organizationId: record.organizationId,
    clientId: record.clientId,
    engagementId: record.engagementId,
  });

  const decision = await authorizeChartAccess({
    actor: input.actor,
    document: input.document,
    record,
    careTeam,
    capability: input.capability,
    breakGlassReason: input.breakGlassReason,
  });
  if (!decision.allowed) throw new Error("Forbidden");
  return { record, decision };
}

async function updateSharePolicy(
  document: ChartDocumentKey,
  recordId: string,
  organizationId: string,
  policy: SharePolicy,
) {
  const db = getDb();
  if (document === "birth_log") {
    await db
      .update(birthLogs)
      .set({ sharePolicy: policy })
      .where(and(eq(birthLogs.id, recordId), eq(birthLogs.organizationId, organizationId)));
    return;
  }
  if (document === "care_plan") {
    await db
      .update(carePlans)
      .set({ sharePolicy: policy })
      .where(and(eq(carePlans.id, recordId), eq(carePlans.organizationId, organizationId)));
    return;
  }
  await db
    .update(visitNotes)
    .set({ sharePolicy: policy })
    .where(and(eq(visitNotes.id, recordId), eq(visitNotes.organizationId, organizationId)));
}

/**
 * Open a signed record to the family, or close it again.
 *
 * The ACL runs first (`share` is not a capability break-glass can reach), then
 * `canSetSharePolicy` — which is what keeps a care plan from being shared before it is
 * signed and keeps a visit note from being shared at all. Widening the Birth Log to
 * `shared_summary` is permitted and still shows the family no clinical field: the strip
 * lives in `clientVisibleFieldKeys`, not in the policy.
 */
export async function setChartSharePolicy(input: {
  actor: ChartActor;
  document: ChartDocumentKey;
  recordId: string;
  policy: string;
}): Promise<{ policy: SharePolicy }> {
  const { record, decision } = await requireChartAccess({
    actor: input.actor,
    document: input.document,
    recordId: input.recordId,
    capability: "share",
  });

  const entityType = CHART_DOCUMENT_ENTITY_TYPES[input.document];
  const guard = canSetSharePolicy({
    document: input.document,
    policy: input.policy,
    status: record.status,
    access: decision,
  });

  if (!guard.ok) {
    await writeAudit({
      organizationId: record.organizationId,
      actorUserId: input.actor.userId,
      action: CHART_AUDIT_ACTIONS.accessDenied,
      entityType,
      entityId: record.id,
      metadata: chartAuditMetadata({
        entityType,
        clientId: record.clientId,
        engagementId: record.engagementId ?? undefined,
        version: record.version,
        sharePolicy: record.sharePolicy,
        capability: "share",
        relationship: decision.relationship,
        denyReason: guard.reason,
      }),
    });
    throw new Error("Forbidden");
  }

  const policy = input.policy as SharePolicy;
  await updateSharePolicy(input.document, record.id, record.organizationId, policy);

  await writeAudit({
    organizationId: record.organizationId,
    actorUserId: input.actor.userId,
    action:
      policy === DEFAULT_SHARE_POLICY
        ? CHART_AUDIT_ACTIONS.shareRevoked
        : CHART_AUDIT_ACTIONS.shared,
    entityType,
    entityId: record.id,
    metadata: chartAuditMetadata({
      entityType,
      clientId: record.clientId,
      engagementId: record.engagementId ?? undefined,
      version: record.version,
      sharePolicy: policy,
      capability: "share",
      relationship: decision.relationship,
    }),
  });

  return { policy };
}

/**
 * The answers of one record, for handing outside the chart. `audience: "client"` runs the
 * answers through the same strip the portal uses, so an export to a family can never carry
 * a field the portal would refuse to render.
 */
export async function exportChartRecord(input: {
  actor: ChartActor;
  document: ChartDocumentKey;
  recordId: string;
  audience: "staff" | "client";
  breakGlassReason?: string | null;
}): Promise<{ record: ChartRecord; answers: ChartAnswers }> {
  const { record, decision } = await requireChartAccess({
    actor: input.actor,
    document: input.document,
    recordId: input.recordId,
    capability: "export",
    breakGlassReason: input.breakGlassReason,
  });

  const answers =
    input.audience === "client"
      ? clientVisibleAnswers(
          input.document,
          record.sharePolicy as SharePolicy,
          record.answers,
        )
      : record.answers;

  const entityType = CHART_DOCUMENT_ENTITY_TYPES[input.document];
  await writeAudit({
    organizationId: record.organizationId,
    actorUserId: input.actor.userId,
    action: CHART_AUDIT_ACTIONS.exported,
    entityType,
    entityId: record.id,
    metadata: chartAuditMetadata({
      entityType,
      clientId: record.clientId,
      engagementId: record.engagementId ?? undefined,
      version: record.version,
      sharePolicy: record.sharePolicy,
      capability: "export",
      relationship: decision.relationship,
      audience: input.audience,
    }),
  });

  return { record, answers };
}

/**
 * Everything of a family's chart their own portal may show them.
 *
 * The SQL filters to signed rows that a doula opened; `passportEntries` filters again and
 * `clientVisibleFieldKeys` decides the fields. A family reads their own record, so the
 * audit row is `chart.viewed` with their user id on it — the same evidence a staff read
 * leaves.
 */
export async function clientChartPassport({
  organizationId,
  clientId,
  actorUserId,
}: {
  organizationId: string;
  clientId: string;
  /** The portal session's user id, for the view audit. */
  actorUserId?: string | null;
}): Promise<PassportEntry[]> {
  if (!organizationId || !clientId) return [];
  const db = getDb();

  const sharedCarePlans = await db
    .select({
      id: carePlans.id,
      status: carePlans.status,
      sharePolicy: carePlans.sharePolicy,
      signedAt: carePlans.signedAt,
      answers: carePlans.answers,
    })
    .from(carePlans)
    .where(
      and(
        eq(carePlans.organizationId, organizationId),
        eq(carePlans.clientId, clientId),
        ne(carePlans.sharePolicy, DEFAULT_SHARE_POLICY),
        inArray(carePlans.status, ["signed", "amended"]),
      ),
    )
    .orderBy(desc(carePlans.version));

  // Birth logs are `staff_only` by default and stay there unless a doula deliberately
  // widened one to `shared_summary`. Included on the same terms as anything else and with
  // no family copy of its own (Vera hold): the clinical grid is stripped by
  // `clientVisibleFieldKeys` under every policy, so what is left is the plain header.
  const sharedBirthLogs = await db
    .select({
      id: birthLogs.id,
      status: birthLogs.status,
      sharePolicy: birthLogs.sharePolicy,
      signedAt: birthLogs.signedAt,
      answers: birthLogs.answers,
    })
    .from(birthLogs)
    .where(
      and(
        eq(birthLogs.organizationId, organizationId),
        eq(birthLogs.clientId, clientId),
        ne(birthLogs.sharePolicy, DEFAULT_SHARE_POLICY),
        inArray(birthLogs.status, ["signed", "amended"]),
      ),
    )
    .orderBy(desc(birthLogs.version));

  const entries = passportEntries([
    ...sharedCarePlans.map((row) => ({ ...row, document: "care_plan" as const })),
    ...sharedBirthLogs.map((row) => ({ ...row, document: "birth_log" as const })),
  ]);

  for (const entry of entries) {
    await writeAudit({
      organizationId,
      actorUserId: actorUserId ?? null,
      action: CHART_AUDIT_ACTIONS.viewed,
      entityType: CHART_DOCUMENT_ENTITY_TYPES[entry.document],
      entityId: entry.id,
      metadata: chartAuditMetadata({
        entityType: CHART_DOCUMENT_ENTITY_TYPES[entry.document],
        clientId,
        capability: "read",
        relationship: "client",
      }),
    });
  }

  return entries;
}
