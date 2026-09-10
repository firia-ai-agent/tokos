/**
 * Who on staff may open a chart row, and what they may do with it (TOK-45).
 *
 * TOK-44 gave the chart tables a closed `share_policy` and a clinical flag. Neither is an
 * ACL: a policy says whether a *family* could ever read a row, and says nothing about
 * which of a practice's own doulas may. This file is that second answer, and it is the
 * only place it is written down — a role string compared inside a page is a rule nobody
 * can find later, and the next page will compare it differently.
 *
 * The locks, accepted by Faith via Firia on 2026-09-10 and mirrored in
 * `docs/chart-schema-map.md`:
 *
 *  - The care team opens the chart: the doula named on the engagement, an active
 *    assignment (primary, co, backup, on-call), and the practice's owner/admin.
 *  - Everyone else on staff is an outsider. An outsider may still open a chart — a birth
 *    does not wait for a roster edit — but only for `read`, only with a reason they typed,
 *    and the row it writes to `audit_logs` is `chart.break_glass`, not `chart.viewed`.
 *  - Break-glass never widens to write, share or export. Getting into the room is not
 *    the same as being allowed to hand the room to someone else.
 *
 * Everything here is pure, so the rules are testable without a database. `lib/chart/access`
 * does the reads and the audit writes around it, and is the seam every query, server
 * action and route must go through — a page that decides for itself is the bug this file
 * exists to make unnecessary.
 */

import type { ChartDocumentKey } from "@/lib/chart/field-defs";
import {
  CARE_PLAN_SHAREABLE_POLICY,
  DEFAULT_SHARE_POLICY,
  isSharePolicy,
  type SharePolicy,
} from "@/lib/chart/share-policy";
import { canManageTeam } from "@/lib/team";

/** What a staff member can be asking to do with a chart row. */
export const CHART_CAPABILITIES = ["read", "write", "share", "export"] as const;
export type ChartCapability = (typeof CHART_CAPABILITIES)[number];

/**
 * How the actor stands to this family. Ordered strongest first — `chartRelationship`
 * returns the earliest match, so an owner who is also the backup is audited as the owner
 * and granted as one.
 */
export const CHART_RELATIONSHIPS = [
  "primary_doula",
  "co_doula",
  "owner_admin",
  "backup",
  "outsider",
] as const;
export type ChartRelationship = (typeof CHART_RELATIONSHIPS)[number];

/** Care-team relationships an `assignments.role` can carry. */
export type AssignedRelationship = Extract<
  ChartRelationship,
  "primary_doula" | "co_doula" | "backup"
>;

/**
 * `assignments.role` → relationship. Roles are free text in the column, so the mapping is
 * declared rather than pattern-matched: a role nobody added here is not on the care team,
 * which is the safe way for an unknown string to fail.
 */
export const ASSIGNMENT_ROLE_RELATIONSHIPS: Record<string, AssignedRelationship> = {
  primary: "primary_doula",
  co: "co_doula",
  co_doula: "co_doula",
  secondary: "co_doula",
  backup: "backup",
  on_call: "backup",
};

/**
 * The grant table. This is the whole ACL — no page adds to it, and a new capability that
 * is not listed for a relationship is denied by omission rather than by remembering to
 * write a check.
 *
 * A backup or on-call doula reads and writes: they are the one at the birth when the
 * primary cannot be. They do not open the record to the family and they do not export it
 * — those are the primary's or the practice's calls to make.
 */
const CAPABILITY_GRANTS: Record<ChartRelationship, readonly ChartCapability[]> = {
  primary_doula: ["read", "write", "share", "export"],
  co_doula: ["read", "write", "share", "export"],
  owner_admin: ["read", "write", "share", "export"],
  backup: ["read", "write"],
  outsider: [],
};

/** Break-glass opens the room and nothing else (Faith K2). */
export const BREAK_GLASS_CAPABILITIES: readonly ChartCapability[] = ["read"];

/**
 * A reason short enough to be a keystroke is not a reason. Eight characters is low enough
 * that "on call" plus a name clears it and high enough that "x" does not.
 */
export const BREAK_GLASS_MIN_REASON_LENGTH = 8;

export type ChartAclActor = {
  organizationId: string;
  userId: string;
  /** `memberships.role` — owner | admin | doula. */
  membershipRole?: string | null;
};

/** The chart row being reached for, narrowed to the columns the decision reads. */
export type ChartAclRecord = {
  organizationId: string;
  clientId: string;
};

/** One `assignments` row for this family. */
export type ChartCareTeamRow = {
  userId: string;
  role: string;
  /** Defaults to active; a closed assignment is not a way in. */
  status?: string | null;
  organizationId?: string | null;
};

export type ChartCareTeam = {
  /** `engagements.primaryDoulaUserId`, when a family has been matched. */
  primaryDoulaUserId?: string | null;
  assignments?: readonly ChartCareTeamRow[];
};

/** Why a decision came out the way it did. PHI-free by construction — these are the only values. */
export type ChartDenyReason = "tenant" | "relationship" | "capability" | "break_glass_reason";
export type ChartAccessReason = "granted" | "break_glass" | ChartDenyReason;

export type ChartAccessDecision = {
  allowed: boolean;
  capability: ChartCapability;
  relationship: ChartRelationship;
  /** True only when a typed reason, not the roster, is what opened the row. */
  breakGlass: boolean;
  reason: ChartAccessReason;
};

export type ChartAccessInput = {
  actor: ChartAclActor;
  record: ChartAclRecord;
  careTeam: ChartCareTeam;
  capability: ChartCapability;
  /** Free text the staff member typed. Audited verbatim; never templated. */
  breakGlassReason?: string | null;
};

function normalizeRole(role: string | null | undefined): string {
  return String(role ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function sameTenant(actor: ChartAclActor, record: ChartAclRecord): boolean {
  return Boolean(actor.organizationId) && actor.organizationId === record.organizationId;
}

/**
 * How this actor stands to this family's chart.
 *
 * The tenant check runs here as well as in SQL. A relationship helper is the last place a
 * tenant boundary should be assumed rather than checked — the same reasoning as
 * `pickAssignedDoula`, and for the same reason: the caller passing the rows is the one who
 * would have to remember.
 */
export function chartRelationship({
  actor,
  record,
  careTeam,
}: Pick<ChartAccessInput, "actor" | "record" | "careTeam">): ChartRelationship {
  if (!sameTenant(actor, record) || !actor.userId) return "outsider";

  const found = new Set<ChartRelationship>();
  if (careTeam.primaryDoulaUserId && careTeam.primaryDoulaUserId === actor.userId) {
    found.add("primary_doula");
  }
  for (const row of careTeam.assignments ?? []) {
    if (row.userId !== actor.userId) continue;
    if (normalizeRole(row.status ?? "active") !== "active") continue;
    if (row.organizationId && row.organizationId !== record.organizationId) continue;
    const relationship = ASSIGNMENT_ROLE_RELATIONSHIPS[normalizeRole(row.role)];
    if (relationship) found.add(relationship);
  }
  if (canManageTeam(actor.membershipRole)) found.add("owner_admin");

  return CHART_RELATIONSHIPS.find((relationship) => found.has(relationship)) ?? "outsider";
}

/**
 * Allow or deny, and why. Callers never re-derive any part of this: `lib/chart/access`
 * turns the decision into an `audit_logs` row and a thrown `Forbidden`, and that is the
 * only path a page, action or route may take to a chart row.
 */
export function chartAccess(input: ChartAccessInput): ChartAccessDecision {
  const relationship = chartRelationship(input);
  const base = { capability: input.capability, relationship, breakGlass: false };

  // A chart in another practice is not a chart this actor has been denied — it is one
  // they were never offered. Same answer, said first, so no roster read can change it.
  if (!sameTenant(input.actor, input.record)) {
    return { ...base, allowed: false, reason: "tenant" };
  }

  if (CAPABILITY_GRANTS[relationship].includes(input.capability)) {
    return { ...base, allowed: true, reason: "granted" };
  }

  const typedReason = String(input.breakGlassReason ?? "").trim();
  if (!BREAK_GLASS_CAPABILITIES.includes(input.capability) || !typedReason) {
    // Distinguish "not on this family's team" from "on it, but this is above your grant"
    // — a backup denied an export should not read as a stranger in the audit trail.
    return {
      ...base,
      allowed: false,
      reason: relationship === "outsider" ? "relationship" : "capability",
    };
  }
  if (typedReason.length < BREAK_GLASS_MIN_REASON_LENGTH) {
    return { ...base, allowed: false, reason: "break_glass_reason" };
  }
  return { ...base, allowed: true, breakGlass: true, reason: "break_glass" };
}

/**
 * The share values each document may ever be moved to, and the reason this is a table
 * rather than a conditional.
 *
 *  - `care_plan` may open to `preferences_shareable`: the preferences are the family's own
 *    answers, handed back (Faith K1).
 *  - `birth_log` may reach `shared_summary` and no further. The policy does not unlock the
 *    clinical grid under any value — `clientVisibleFieldKeys` refuses it — so this entry
 *    controls the summary and nothing else.
 *  - Visit notes never open. A prenatal note is clinical documentation; what is safe to
 *    hand a family out of that visit lives in the care plan, which is why the care plan is
 *    a separate table at all.
 */
export const SHAREABLE_POLICIES: Record<ChartDocumentKey, readonly SharePolicy[]> = {
  prenatal_visit: [DEFAULT_SHARE_POLICY],
  postpartum_visit: [DEFAULT_SHARE_POLICY],
  birth_log: [DEFAULT_SHARE_POLICY, "shared_summary"],
  care_plan: [DEFAULT_SHARE_POLICY, CARE_PLAN_SHAREABLE_POLICY],
};

/** Statuses that mean a doula stood behind this row. Only these may be opened to a family. */
const SIGNED_STATUSES = ["signed", "amended"];

export type ChartShareDenyReason = "capability" | "policy" | "document" | "unsigned";
export type ChartShareGuard = { ok: true } | { ok: false; reason: ChartShareDenyReason };

export type ChartShareGuardInput = {
  document: ChartDocumentKey;
  /** Straight off the form — validated here, never cast by the caller. */
  policy: string;
  /** `status` on the row being shared. */
  status: string;
  /** The `share` decision from `chartAccess`, already made. */
  access: ChartAccessDecision;
};

/**
 * Whether this share may be written. Passport-style: a family only ever receives something
 * a doula signed, so an unsigned care plan cannot be opened even by an owner. Closing a
 * record back to `staff_only` is always allowed to whoever may share it — revoking is not
 * a widening, and a draft must be closable.
 */
export function canSetSharePolicy(input: ChartShareGuardInput): ChartShareGuard {
  if (!input.access.allowed || input.access.capability !== "share") {
    return { ok: false, reason: "capability" };
  }
  if (!isSharePolicy(input.policy)) return { ok: false, reason: "policy" };
  if (!SHAREABLE_POLICIES[input.document].includes(input.policy)) {
    return { ok: false, reason: "document" };
  }
  if (input.policy !== DEFAULT_SHARE_POLICY && !SIGNED_STATUSES.includes(input.status)) {
    return { ok: false, reason: "unsigned" };
  }
  return { ok: true };
}

/** A row a family could read at all: signed by a doula, and opened by one. */
export function isSharedWithClient(row: { status: string; sharePolicy: string }): boolean {
  return (
    SIGNED_STATUSES.includes(row.status) &&
    isSharePolicy(row.sharePolicy) &&
    row.sharePolicy !== DEFAULT_SHARE_POLICY
  );
}
