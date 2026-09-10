/**
 * Card density for the two Homes (TOK-52 density pass).
 *
 * The clickable queues shipped and the layout still read as a prototype: a family on
 * agency Home carried a due date, a city and a stage chip, while the same family on the
 * pipeline board carried service, EDD with gestation, where she came from, what she owes
 * and a terracotta edge when she needed working today. Two surfaces, one family, and the
 * denser one was the one nobody opens first.
 *
 * So the facts a card shows are decided here, once, from fields that already exist on
 * `clients` and the ledger — `serviceType`, `edd`, `source`, `lastContactAt`, invoice and
 * contract totals — and Home, the review board and anything after them read the same
 * builder. Nothing is invented: a fact with no value is simply absent, because a row of
 * "—" is how a dense card turns back into an empty one.
 *
 * Pure. No database, no session; the rules are provable without either.
 */

import {
  eddWithWeeks,
  lastContactLabel,
  leadSourceLabel,
  serviceTypeLabel,
} from "@/lib/lead-fields";
import { formatCents } from "@/lib/money";

/**
 * Terracotta down the left edge means "needs action today" — the one piece of urgency
 * language the pipeline board already speaks (shot 01). It is a class rather than a
 * boolean so Home and the review board cannot draw two different reds.
 */
export const NEEDS_ACTION_EDGE = "border-l-[3px] border-l-coral";
export const CALM_EDGE = "border-l-[3px] border-l-transparent";

export function edgeClass(needsAction: boolean): string {
  return needsAction ? NEEDS_ACTION_EDGE : CALM_EDGE;
}

export type MoneyTone = "coral" | "teal" | "ink";

export type FamilyCardInput = {
  id: string;
  name: string;
  href: string;
  /** Already worded for the persona (`staffStageLabel`) — this module never picks words for a funnel. */
  stageLabel: string;
  serviceType?: string | null;
  edd?: string | null;
  source?: string | null;
  lastContactAt?: Date | string | null;
  /** Open invoices on this family, in cents. */
  outstandingCents?: number;
  /** Sent-and-unsigned agreements, in cents. */
  unsignedCents?: number;
  /** Cleared invoices, in cents. */
  clearedCents?: number;
  /** "Follow-up overdue · Not reviewed" from the needs-attention rules; null when clear. */
  attention?: string | null;
};

export type FamilyCard = {
  id: string;
  name: string;
  href: string;
  stageLabel: string;
  /** Service · EDD with gestation · where she came from and when she was last touched. */
  facts: string[];
  /** The one money fact worth the row, or null when this family has no ledger yet. */
  money: { label: string; tone: MoneyTone } | null;
  /** Drives the terracotta edge. True exactly when a needs-attention rule fired. */
  needsAction: boolean;
  attention: string | null;
};

/**
 * "Website · 3d ago". The source alone while nobody has logged a contact — "No contact
 * logged" is a finding for the review board, not a caption on a card.
 */
export function contactFact(
  source: string | null | undefined,
  lastContactAt: Date | string | null | undefined,
  now: Date = new Date(),
): string {
  const where = leadSourceLabel(source);
  if (!lastContactAt) return where;
  return `${where} · ${lastContactLabel(lastContactAt, now).toLowerCase()}`;
}

/**
 * The single money line for a card, worst first: what she owes beats what is unsigned,
 * which beats what has already cleared. One line, because a card that lists three
 * balances is a statement, not a card.
 */
export function moneyFact(input: {
  outstandingCents?: number;
  unsignedCents?: number;
  clearedCents?: number;
}): { label: string; tone: MoneyTone } | null {
  const money = (cents: number) => formatCents(cents).replace(/\.00$/, "");
  if ((input.outstandingCents ?? 0) > 0) {
    return { label: `${money(input.outstandingCents!)} open`, tone: "coral" };
  }
  if ((input.unsignedCents ?? 0) > 0) {
    return { label: `${money(input.unsignedCents!)} unsigned`, tone: "coral" };
  }
  if ((input.clearedCents ?? 0) > 0) {
    return { label: `${money(input.clearedCents!)} paid`, tone: "teal" };
  }
  return null;
}

/** The facts line, in reading order, with the blanks dropped rather than dashed. */
export function familyFacts(input: FamilyCardInput, now: Date = new Date()): string[] {
  return [
    serviceTypeLabel(input.serviceType),
    eddWithWeeks(input.edd, now),
    contactFact(input.source, input.lastContactAt, now),
  ].filter((fact): fact is string => Boolean(fact && fact.trim()));
}

export function familyCard(input: FamilyCardInput, now: Date = new Date()): FamilyCard {
  const attention = input.attention?.trim() ? input.attention.trim() : null;
  return {
    id: input.id,
    name: input.name,
    href: input.href,
    stageLabel: input.stageLabel,
    facts: familyFacts(input, now),
    money: moneyFact(input),
    needsAction: attention !== null,
    attention,
  };
}

/** Needs-action families first — the edge is only useful if it is near the top. */
export function familyCards(
  inputs: readonly FamilyCardInput[],
  now: Date = new Date(),
): FamilyCard[] {
  return inputs
    .map((input) => familyCard(input, now))
    .sort((a, b) => Number(b.needsAction) - Number(a.needsAction));
}

/* ------------------------------------------------------------------- revenue */

/**
 * What the Cleared revenue panel is allowed to draw.
 *
 * Six full-height ghost bars over six `$0` labels was the loudest thing on the fold and
 * it said nothing — an empty chart is a chart that has not earned its space. So the panel
 * asks first: with no cleared month in the window there is no chart, just a line and the
 * way to the ledger.
 */
export type ClearedTrend = {
  hasHistory: boolean;
  /** Chart height in px. Zero when there is nothing to plot. */
  chartHeight: number;
  /** The line the panel shows instead of, or under, the bars. */
  note: string;
};

export function clearedTrend(
  bars: readonly { cents: number }[],
  clearedTotal = 0,
): ClearedTrend {
  const hasHistory = bars.some((bar) => bar.cents > 0);
  if (hasHistory) {
    return { hasHistory, chartHeight: 88, note: "Six-month trend from paid invoices" };
  }
  return {
    hasHistory,
    chartHeight: 0,
    note:
      clearedTotal > 0
        ? "Nothing cleared in the last six months. Older payments are in the ledger."
        : "No invoice has cleared yet. The trend draws itself from the ledger — never from demo numbers.",
  };
}

/** Bar height as a percentage of the tallest month. Only called when there is history. */
export function barHeightPercent(cents: number, maxCents: number): number {
  if (maxCents <= 0) return 0;
  return Math.max(6, Math.round((cents / maxCents) * 100));
}
