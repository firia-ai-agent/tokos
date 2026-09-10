/**
 * Needs Attention: one rule set, three surfaces (TOK-49).
 *
 * Home used to render "6 items need your review" as unlinked prose, and the board had a
 * separate idea of what was urgent. Both now ask this module, which answers with rows
 * keyed by family rather than by finding — NOVA's note on the feedback was that a client
 * should appear once with a short list of reasons, because a list that repeats a name
 * four times is the list people stop reading.
 *
 * Pure by design: the rules are the product decision, and they should be provable without
 * a database or a session.
 */

import { differenceInCalendarDays } from "date-fns";
import {
  isOpenLeadStage,
  isOpenStage,
  stageLabel,
  type PipelineStageName,
} from "@/lib/pipeline";
import { followUpState, leadDate } from "@/lib/lead-fields";
import { formatCents } from "@/lib/money";

export const NEEDS_ATTENTION_REASONS = [
  "agreement_waiting",
  "open_invoice",
  "follow_up_overdue",
  "consult_note_missing",
  "unmatched",
  "unreviewed",
  "intake_nudge",
] as const;
export type NeedsAttentionReasonKey = (typeof NEEDS_ATTENTION_REASONS)[number];

export type NeedsAttentionReason = {
  key: NeedsAttentionReasonKey;
  label: string;
  /** Highest first. Drives both the row order and which reason leads the summary. */
  weight: number;
  /**
   * The one number or word that makes the reason concrete — "$2,800.00 · not signed",
   * "Fit confirmed". Optional because most rules are true or false and nothing more; a
   * detail is only ever a fact the caller passed in, never invented copy.
   */
  detail?: string;
  /** Money and overdue work reads terracotta; a soft nudge does not (TOK-53). */
  urgent: boolean;
};

/** What each rule is called on screen. Agency vocabulary; never a client surface. */
export const NEEDS_ATTENTION_LABELS: Record<NeedsAttentionReasonKey, string> = {
  agreement_waiting: "Agreement waiting",
  open_invoice: "Open invoice",
  follow_up_overdue: "Follow-up overdue",
  consult_note_missing: "Consult done, no note logged",
  unmatched: "No primary doula",
  unreviewed: "Not reviewed",
  intake_nudge: "Keep intake moving",
};

/**
 * Which reasons are money or a missed date, and which are housekeeping.
 *
 * The bell used to draw every line the same weight, so "sent an agreement three weeks ago
 * and nobody signed it" looked exactly like "nobody has ticked reviewed". Terracotta is
 * spent on the first kind only — a warning colour on everything is a warning colour on
 * nothing.
 */
const URGENT: Record<NeedsAttentionReasonKey, boolean> = {
  agreement_waiting: true,
  open_invoice: true,
  follow_up_overdue: true,
  consult_note_missing: false,
  unmatched: false,
  unreviewed: false,
  intake_nudge: false,
};

/**
 * What to do about each rule, and where it is done (TOK-52).
 *
 * The label says what is wrong; this says what fixes it, and points at the section of the
 * record that fixes it. It lives with the rules so the review board cannot drift into
 * inventing links of its own — a queue that opens the wrong tab is the polite version of
 * a queue that opens nothing.
 */
const ACTIONS: Record<NeedsAttentionReasonKey, { action: string; anchor: string }> = {
  agreement_waiting: { action: "Chase the signature", anchor: "#money" },
  open_invoice: { action: "Chase the payment", anchor: "#money" },
  follow_up_overdue: { action: "Set the next follow-up", anchor: "#lead-details" },
  consult_note_missing: { action: "Write the consult note", anchor: "#notes" },
  unmatched: { action: "Name a primary doula", anchor: "#care-team" },
  unreviewed: { action: "Review the record", anchor: "#lead-details" },
  intake_nudge: { action: "Move intake along", anchor: "#lead-details" },
};

export function reasonActionLabel(key: NeedsAttentionReasonKey): string {
  return ACTIONS[key].action;
}

/** The exact surface that clears this reason — a section of the family's record. */
export function reasonActionHref(clientId: string, key: NeedsAttentionReasonKey): string {
  return `/doula/clients/${clientId}${ACTIONS[key].anchor}`;
}

/**
 * Commercial urgency outranks housekeeping, which outranks a nudge (TOK-53).
 *
 * An unsigned agreement and an unpaid invoice are the two findings with a number attached
 * to them, so they sort above the office chores and lead the summary under the name.
 */
const WEIGHTS: Record<NeedsAttentionReasonKey, number> = {
  agreement_waiting: 60,
  open_invoice: 50,
  follow_up_overdue: 40,
  consult_note_missing: 30,
  unmatched: 20,
  unreviewed: 10,
  intake_nudge: 5,
};

export type NeedsAttentionInput = {
  clientId: string;
  name: string;
  stage: PipelineStageName;
  followUpDueOn?: string | null;
  reviewed?: boolean | null;
  hasPrimaryDoula?: boolean;
  /** When the record entered its current stage — `pipeline_stages.enteredAt`. */
  stageEnteredAt?: Date | string | null;
  /** Most recent line in the notes feed, whatever wrote it. */
  lastNoteAt?: Date | string | null;
  /** A non-voided agreement is out and nobody has signed it. */
  hasUnsignedAgreement?: boolean;
  /** What those unsigned agreements are worth, in cents. Detail copy only. */
  unsignedAgreementCents?: number;
  /** At least one invoice sits at `open`. */
  hasOpenInvoice?: boolean;
  /** What those open invoices are worth, in cents. Detail copy only. */
  openInvoiceCents?: number;
};

export type NeedsAttentionRow = {
  clientId: string;
  name: string;
  stage: PipelineStageName;
  stageLabel: string;
  reasons: NeedsAttentionReason[];
  /** Sum of reason weights — how far up the queue this family sits. */
  score: number;
  href: string;
};

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const reason = (key: NeedsAttentionReasonKey, detail?: string): NeedsAttentionReason => ({
  key,
  label: NEEDS_ATTENTION_LABELS[key],
  weight: WEIGHTS[key],
  urgent: URGENT[key],
  ...(detail ? { detail } : {}),
});

/** "$2,800.00" when there is a number worth printing, nothing when there is not. */
const money = (cents: number | undefined, suffix?: string): string | undefined => {
  if (!cents || cents <= 0) return undefined;
  return suffix ? `${formatCents(cents)} · ${suffix}` : formatCents(cents);
};

/**
 * The rules, in one function.
 *
 * A closed record is exempt from all of them: it is finished, and a finished family that
 * keeps shouting is exactly how a queue stops being trusted.
 */
export function needsAttentionReasons(
  input: NeedsAttentionInput,
  today: Date = new Date(),
): NeedsAttentionReason[] {
  if (!isOpenStage(input.stage)) return [];

  const reasons: NeedsAttentionReason[] = [];

  // Money first. Both facts come from the ledger the caller already read, so the rule is
  // "is anything outstanding", not "go and look" — this module still touches no database.
  if (input.hasUnsignedAgreement || (input.unsignedAgreementCents ?? 0) > 0) {
    reasons.push(reason("agreement_waiting", money(input.unsignedAgreementCents, "not signed")));
  }

  if (input.hasOpenInvoice || (input.openInvoiceCents ?? 0) > 0) {
    reasons.push(reason("open_invoice", money(input.openInvoiceCents)));
  }

  if (followUpState(input.followUpDueOn, today).state === "overdue") {
    reasons.push(reason("follow_up_overdue"));
  }

  // "Note in by 4pm" is NOVA's own rule. A consult with nothing written down is the one
  // that gets re-litigated from memory a month later.
  if (input.stage === "consult_done") {
    const lastNote = asDate(input.lastNoteAt);
    const enteredAt = asDate(input.stageEnteredAt);
    const stale = !lastNote || (enteredAt ? lastNote < enteredAt : false);
    if (stale) reasons.push(reason("consult_note_missing"));
  }

  if (!input.hasPrimaryDoula) reasons.push(reason("unmatched"));

  if (!input.reviewed) reasons.push(reason("unreviewed"));

  // The soft one, last, and deliberately hard to trigger.
  //
  // The flat bell fired this on every open funnel stage, which is how Jordan arrived in
  // the list a third time under "Fit" while an unsigned agreement and an open invoice
  // were already shouting about her. A nudge is only worth a row when it is the *only*
  // thing anyone can say about a family: she is still in the funnel, nothing sharper has
  // fired, and — the gap `follow_up_overdue` deliberately leaves — nobody has planned the
  // next step at all. Anything less strict and the queue becomes the client list.
  if (
    reasons.length === 0 &&
    isOpenLeadStage(input.stage) &&
    !hasFollowUp(input.followUpDueOn)
  ) {
    reasons.push(reason("intake_nudge", stageLabel(input.stage)));
  }

  return reasons.sort((a, b) => b.weight - a.weight);
}

export function needsAttention(input: NeedsAttentionInput, today: Date = new Date()): boolean {
  return needsAttentionReasons(input, today).length > 0;
}

/** One row per family, worst first, name once. */
export function needsAttentionRows(
  inputs: readonly NeedsAttentionInput[],
  today: Date = new Date(),
): NeedsAttentionRow[] {
  return inputs
    .map((input) => {
      const reasons = needsAttentionReasons(input, today);
      return {
        clientId: input.clientId,
        name: input.name,
        stage: input.stage,
        stageLabel: stageLabel(input.stage),
        reasons,
        score: reasons.reduce((sum, item) => sum + item.weight, 0),
        href: `/doula/clients/${input.clientId}`,
      };
    })
    .filter((row) => row.reasons.length > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

/** "Follow-up overdue · Not reviewed" — the short list under the name. */
export function reasonSummary(row: NeedsAttentionRow): string {
  return row.reasons.map((item) => item.label).join(" · ");
}

/**
 * How stale an open lead's last contact is, for the doula's two-tap contact log. Not a
 * Needs Attention rule yet (the configurable "no contact in 7 days" is P1) but the same
 * arithmetic, so it lives beside the rules rather than in a page.
 */
export function daysSinceContact(
  lastContactAt: Date | string | null | undefined,
  now: Date = new Date(),
): number | null {
  const date = asDate(lastContactAt);
  return date ? differenceInCalendarDays(now, date) : null;
}

/** Does this record still have a usable follow-up date at all? */
export function hasFollowUp(dueOn: string | null | undefined): boolean {
  return leadDate(dueOn) !== null;
}
