/**
 * The pipeline board's query language (TOK-49).
 *
 * "Who slips today?" is the question the list has to answer, so the default order is
 * Follow-Up Due ascending with overdue pinned above everything — not alphabetical, which
 * is what it was, and which answers nothing.
 *
 * Filtering and sorting live here rather than in the page for two reasons: they are the
 * part worth testing, and the doula view and the agency view have to be the same list
 * seen through different scopes rather than two lists that drift.
 */

import {
  eddMonthKey,
  followUpSortKey,
  followUpState,
  normalizeInsurance,
  normalizeSource,
  type InsuranceStatus,
  type LeadSource,
} from "@/lib/lead-fields";
import { isOpenLeadStage, type PipelineStageName } from "@/lib/pipeline";
import { needsAttentionReasons, type NeedsAttentionInput } from "@/lib/needs-attention";

/**
 * The shape the board needs, structurally. Declared minimally so a test can build a row
 * by hand and the real `LeadBoardRow` still satisfies it.
 */
export type LeadRowLike = {
  client: {
    id: string;
    displayName: string;
    email: string;
    phone: string | null;
    serviceType: string | null;
    edd: string | null;
    source: string;
    insurance: string;
    followUpDueOn: string | null;
    lastContactAt: Date | null;
    reviewed: boolean;
    ownerUserId: string | null;
  };
  stage: PipelineStageName;
  stageEnteredAt: Date | null;
  primaryDoulaUserId: string | null;
  lastNoteAt: Date | null;
  /**
   * Open invoices and unsigned agreements, in cents (TOK-53). Optional so a test can
   * still build a row by hand; absent simply means "no money is waiting on this family".
   */
  ledger?: { outstandingCents?: number; unsignedCents?: number };
};

export type LeadQuery = {
  tab: "all" | "attention" | "unmatched";
  q: string;
  stage: string;
  service: string;
  owner: string;
  source: string;
  insurance: string;
  eddMonth: string;
  unmatched: boolean;
  overdue: boolean;
  unreviewed: boolean;
};

export const EMPTY_LEAD_QUERY: LeadQuery = {
  tab: "all",
  q: "",
  stage: "",
  service: "",
  owner: "",
  source: "",
  insurance: "",
  eddMonth: "",
  unmatched: false,
  overdue: false,
  unreviewed: false,
};

const TABS = ["all", "attention", "unmatched"] as const;

/** Read the board's URL state. Unknown values fall back rather than filtering to nothing. */
export function parseLeadQuery(
  params: Record<string, string | string[] | undefined>,
): LeadQuery {
  const one = (key: string) => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
  };
  const flag = (key: string) => ["1", "true", "yes", "on"].includes(one(key).toLowerCase());
  const tab = one("tab") as LeadQuery["tab"];

  return {
    tab: TABS.includes(tab) ? tab : "all",
    q: one("q"),
    stage: one("stage"),
    service: one("service"),
    owner: one("owner"),
    source: one("source"),
    insurance: one("insurance"),
    eddMonth: one("eddMonth"),
    unmatched: flag("unmatched"),
    overdue: flag("overdue"),
    unreviewed: flag("unreviewed"),
  };
}

/** Is anything narrowing the list right now? Drives the "Clear filters" affordance. */
export function isFiltered(query: LeadQuery): boolean {
  return (
    query.tab !== "all" ||
    Boolean(
      query.q ||
        query.stage ||
        query.service ||
        query.owner ||
        query.source ||
        query.eddMonth ||
        query.insurance,
    ) ||
    query.unmatched ||
    query.overdue ||
    query.unreviewed
  );
}

function attentionInputOf(row: LeadRowLike): NeedsAttentionInput {
  return {
    clientId: row.client.id,
    name: row.client.displayName,
    stage: row.stage,
    followUpDueOn: row.client.followUpDueOn,
    reviewed: row.client.reviewed,
    hasPrimaryDoula: Boolean(row.primaryDoulaUserId),
    stageEnteredAt: row.stageEnteredAt,
    lastNoteAt: row.lastNoteAt,
    unsignedAgreementCents: row.ledger?.unsignedCents,
    openInvoiceCents: row.ledger?.outstandingCents,
  };
}

function matchesSearch(row: LeadRowLike, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [row.client.displayName, row.client.email, row.client.phone ?? ""]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

export function filterLeadRows<T extends LeadRowLike>(
  rows: readonly T[],
  query: LeadQuery,
  today: Date = new Date(),
): T[] {
  return rows.filter((row) => {
    if (!matchesSearch(row, query.q)) return false;
    if (query.stage && row.stage !== query.stage) return false;
    if (query.service && row.client.serviceType !== query.service) return false;
    if (query.owner && row.client.ownerUserId !== query.owner) return false;
    if (query.source && normalizeSource(row.client.source) !== (query.source as LeadSource)) {
      return false;
    }
    if (
      query.insurance &&
      normalizeInsurance(row.client.insurance) !== (query.insurance as InsuranceStatus)
    ) {
      return false;
    }
    if (query.eddMonth && eddMonthKey(row.client.edd) !== query.eddMonth) return false;

    // "No primary doula" only means something while the record is still live; a closed
    // lead that was never matched is not a queue item.
    const unmatched = !row.primaryDoulaUserId && isOpenLeadStage(row.stage);
    if (query.unmatched && !unmatched) return false;
    if (query.overdue && followUpState(row.client.followUpDueOn, today).state !== "overdue") {
      return false;
    }
    if (query.unreviewed && row.client.reviewed) return false;

    if (query.tab === "unmatched" && !unmatched) return false;
    if (query.tab === "attention" && needsAttentionReasons(attentionInputOf(row), today).length === 0) {
      return false;
    }
    return true;
  });
}

/**
 * Follow-Up Due ascending, overdue pinned on top, then a stable name order.
 *
 * `followUpSortKey` already returns negative for overdue and `MAX_SAFE_INTEGER` for
 * "no date", so ascending on it gives all three groups in the right order for free.
 */
export function sortLeadRows<T extends LeadRowLike>(
  rows: readonly T[],
  today: Date = new Date(),
): T[] {
  return [...rows].sort((a, b) => {
    const keyA = followUpSortKey(a.client.followUpDueOn, today);
    const keyB = followUpSortKey(b.client.followUpDueOn, today);
    if (keyA !== keyB) return keyA - keyB;
    return a.client.displayName.localeCompare(b.client.displayName);
  });
}

/** Filter then sort — the one call a page makes. */
export function leadBoardView<T extends LeadRowLike>(
  rows: readonly T[],
  query: LeadQuery,
  today: Date = new Date(),
): T[] {
  return sortLeadRows(filterLeadRows(rows, query, today), today);
}

/** Counts for the tab strip, computed off the unfiltered scope so they never lie. */
export function leadBoardCounts(rows: readonly LeadRowLike[], today: Date = new Date()) {
  let attention = 0;
  let unmatched = 0;
  let overdue = 0;
  for (const row of rows) {
    if (needsAttentionReasons(attentionInputOf(row), today).length > 0) attention += 1;
    if (!row.primaryDoulaUserId && isOpenLeadStage(row.stage)) unmatched += 1;
    if (followUpState(row.client.followUpDueOn, today).state === "overdue") overdue += 1;
  }
  return { total: rows.length, attention, unmatched, overdue };
}

/** EDD months present in this scope, oldest first — the filter's own option list. */
export function eddMonthOptions(rows: readonly LeadRowLike[]): string[] {
  const keys = new Set<string>();
  for (const row of rows) {
    const key = eddMonthKey(row.client.edd);
    if (key) keys.add(key);
  }
  return [...keys].sort();
}

/** Owners present in this scope, so the picker never offers an empty filter. */
export function ownerOptions(
  rows: readonly LeadRowLike[],
  nameOf: (userId: string) => string | null,
): Array<{ value: string; label: string }> {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.client.ownerUserId) ids.add(row.client.ownerUserId);
  }
  return [...ids]
    .map((id) => ({ value: id, label: nameOf(id) ?? "Unknown" }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
