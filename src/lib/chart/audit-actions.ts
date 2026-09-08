/**
 * The only chart action and entity strings in the app (TOK-44).
 *
 * `audit_logs` is reused as-is — chart work adds no table, only vocabulary. Every write
 * goes through `writeAudit` in `lib/audit`, which runs metadata past the PHI firewall, so
 * the metadata builder here deliberately carries ids and policy names and nothing a family
 * said. Note also that `lib/phi` blocks keys containing "note"/"birth log"/"clinical": the
 * key names below are chosen to describe the row without naming its contents.
 */

/** `audit_logs.entity_type` for the three chart tables. */
export const CHART_ENTITY_TYPES = {
  visitNote: "visit_note",
  birthLog: "birth_log",
  carePlan: "care_plan",
} as const;

export type ChartEntityType = (typeof CHART_ENTITY_TYPES)[keyof typeof CHART_ENTITY_TYPES];

/**
 * `audit_logs.action` for chart work. `viewed` matters as much as `signed`: a staff-only
 * record that no one can prove was read is not staff-only, it is unwatched.
 */
export const CHART_AUDIT_ACTIONS = {
  created: "chart.created",
  viewed: "chart.viewed",
  updated: "chart.updated",
  /** Doula signature — the row is immutable from here (sign → lock). */
  signed: "chart.signed",
  /** A new version superseding a signed row, never an edit in place. */
  amended: "chart.amended",
  shared: "chart.shared",
  shareRevoked: "chart.share_revoked",
  exported: "chart.exported",
  /** On-call opening a chart they are not assigned to; reason required (Faith K2). */
  breakGlass: "chart.break_glass",
} as const;

export type ChartAuditAction =
  (typeof CHART_AUDIT_ACTIONS)[keyof typeof CHART_AUDIT_ACTIONS];

/**
 * PHI-free metadata for a chart audit row. Ids, a policy name, a version, and — for
 * break-glass — the reason the on-call doula typed. Answers never appear here.
 */
export function chartAuditMetadata(input: {
  entityType: ChartEntityType;
  clientId?: string;
  engagementId?: string;
  version?: number;
  sharePolicy?: string;
  /** Free text from staff, so it stays out of anything a template can render. */
  reason?: string;
}): Record<string, string> {
  const out: Record<string, string> = { record_type: input.entityType };
  if (input.clientId) out.client_id = input.clientId;
  if (input.engagementId) out.engagement_id = input.engagementId;
  if (input.version !== undefined) out.version = String(input.version);
  if (input.sharePolicy) out.share_policy = input.sharePolicy;
  if (input.reason) out.reason = input.reason;
  return out;
}
