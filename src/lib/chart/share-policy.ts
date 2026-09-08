/**
 * Who may ever see a chart row (TOK-44).
 *
 * These are the only share values the chart tables accept, and they are flags on the row —
 * not an ACL. The APIs that read them land in TOK-45; what this file owes that ticket is a
 * single place where the defaults live, so a later reader of a chart cannot invent a
 * policy string that no one reviewed.
 *
 * The Birth Log default is the load-bearing one. A family opening a dilation/station grid,
 * an APGAR, or a degree of tearing they were never walked through is the failure this
 * whole ticket exists to make structurally impossible: `birth_logs.share_policy` is NOT
 * NULL, defaults to `staff_only`, and `clientVisibleFieldKeys` refuses the clinical fields
 * under every policy — including the shared one. Faith's K1 answer can widen the summary;
 * it cannot widen the grid without an explicit code change reviewed against this comment.
 */
import { chartFields, type ChartDocumentKey } from "@/lib/chart/field-defs";

export const SHARE_POLICIES = [
  /** Chart lives inside the practice. No client-facing surface reads it. */
  "staff_only",
  /**
   * The family may read the preference answers they gave — birth preferences, code word,
   * newborn procedure choices. Never clinical observation. Faith K1: signed prenatal
   * preferences are the one thing safe to hand back.
   */
  "preferences_shareable",
  /**
   * A doula deliberately shared a summary of this record (TOK-45 writes it). Still never
   * the clinical grid — see `clientVisibleFieldKeys`.
   */
  "shared_summary",
] as const;

export type SharePolicy = (typeof SHARE_POLICIES)[number];

/** Nothing reaches a family by accident; every table starts closed. */
export const DEFAULT_SHARE_POLICY: SharePolicy = "staff_only";

/**
 * Birth Log is staff-only by default and stays that way for the clinical grid forever
 * (F8 + room lock). Named separately from the generic default so a future edit to one
 * cannot quietly move the other.
 */
export const BIRTH_LOG_DEFAULT_SHARE_POLICY: SharePolicy = "staff_only";

/**
 * Care plans also start closed. `preferences_shareable` is the value TOK-45 may set on a
 * *signed* plan once Faith answers K1 — we hold it as a named constant rather than a
 * default so the permissive reading is a decision someone makes, not one we shipped.
 */
export const CARE_PLAN_SHAREABLE_POLICY: SharePolicy = "preferences_shareable";

export function isSharePolicy(value: string): value is SharePolicy {
  return (SHARE_POLICIES as readonly string[]).includes(value);
}

/**
 * The field keys a client may see for a document under a policy — the rule TOK-45's share
 * APIs must call rather than re-deriving.
 *
 * Two invariants, in this order:
 *  1. A clinical field (dilation/effacement/station, interventions, APGAR, tearing) is
 *     never returned, whatever the policy says.
 *  2. `staff_only` returns nothing at all.
 */
export function clientVisibleFieldKeys(
  document: ChartDocumentKey,
  policy: SharePolicy,
): string[] {
  if (policy === "staff_only") return [];
  return chartFields(document)
    .filter((field) => !field.clinical)
    .map((field) => field.key);
}

/** True when a family could read this field at all — the guard the grid must always fail. */
export function isClientVisibleField(
  document: ChartDocumentKey,
  policy: SharePolicy,
  fieldKey: string,
): boolean {
  return clientVisibleFieldKeys(document, policy).includes(fieldKey);
}

/**
 * The policy each document starts on. Everything is `staff_only` at rest — a care plan
 * only becomes `preferences_shareable` when a doula says so (TOK-45), never at insert.
 */
export const DOCUMENT_DEFAULT_SHARE_POLICY: Record<ChartDocumentKey, SharePolicy> = {
  prenatal_visit: DEFAULT_SHARE_POLICY,
  postpartum_visit: DEFAULT_SHARE_POLICY,
  birth_log: BIRTH_LOG_DEFAULT_SHARE_POLICY,
  care_plan: DEFAULT_SHARE_POLICY,
};
