/**
 * The two Home queues, in one place (TOK-52).
 *
 * Both Homes used to print their count as prose — "6 items need your review" over the
 * agency greeting, "9 things waiting for you" over the family's — and neither number went
 * anywhere. A count that cannot be clicked is a count nobody works: you read it, you
 * believe it, and then you go hunting through the nav for the six things it meant.
 *
 * So each summary is built here together with the board it opens, and the pages render a
 * link rather than a string. `reviewQueueLink` / `waitingQueueLink` are the contract: if
 * the words exist, the destination exists.
 *
 * Everything is pure. The agency side reads the same rules the board and the leads tab
 * use (`@/lib/needs-attention`); the family side is built from the same six cards Home
 * shows (`@/lib/checklist`), so a chore cannot say "3 open" on one surface and "all done"
 * on the other.
 */

import type { PipelineStageName } from "@/lib/pipeline";
import {
  reasonActionHref,
  reasonActionLabel,
  type NeedsAttentionReasonKey,
  type NeedsAttentionRow,
} from "@/lib/needs-attention";
import {
  checklistCards,
  checklistSummary,
  type ChecklistCard,
  type ChecklistCounts,
} from "@/lib/checklist";

/** A summary and the board it opens. Never one without the other. */
export type QueueLink = { href: string; label: string };

/** The agency / staff review board. */
export const REVIEW_BOARD_HREF = "/doula/review";
/** The family waiting board. */
export const WAITING_BOARD_HREF = "/portal/waiting";

/* ------------------------------------------------------------------ agency */

/**
 * The words over the agency greeting, kept from the screenshot Vera marked up. One row is
 * one item: a family appears once, however many rules it tripped (TOK-49).
 */
export function reviewQueueSummary(count: number): string {
  if (count <= 0) return "Nothing needs your review";
  return count === 1 ? "1 item needs your review" : `${count} items need your review`;
}

export function reviewQueueLink(count: number): QueueLink {
  return { href: REVIEW_BOARD_HREF, label: reviewQueueSummary(count) };
}

/** One thing to do, on one family, with the surface that does it. */
export type ReviewTask = {
  key: NeedsAttentionReasonKey;
  /** What is wrong — "Follow-up overdue". */
  label: string;
  /** What to do about it — "Set the next follow-up". */
  action: string;
  href: string;
};

export type ReviewBoardRow = {
  clientId: string;
  name: string;
  /** Kept raw so the board can word it per persona (`staffStageLabel`). */
  stage: PipelineStageName;
  /** The record itself, for the name link. */
  href: string;
  tasks: ReviewTask[];
  /** Record, forms, agreement and invoices, messages — the family's own surfaces. */
  surfaces: QueueLink[];
};

/**
 * Where the rest of a family's work lives. The review board links out to these rather
 * than sending everyone back to the top of the record and asking them to scroll.
 */
export function familySurfaceLinks(clientId: string): QueueLink[] {
  const record = `/doula/clients/${clientId}`;
  return [
    { href: record, label: "Record" },
    { href: `${record}#forms`, label: "Forms" },
    { href: `${record}#money`, label: "Agreement & invoices" },
    { href: `${record}#portal-messages`, label: "Messages" },
  ];
}

/**
 * Needs-attention rows, opened out into the work they imply. The rules module owns both
 * the reason and where it is fixed, so the board never invents a link of its own.
 */
export function reviewBoard(rows: readonly NeedsAttentionRow[]): ReviewBoardRow[] {
  return rows.map((row) => ({
    clientId: row.clientId,
    name: row.name,
    stage: row.stage,
    href: row.href,
    surfaces: familySurfaceLinks(row.clientId),
    tasks: row.reasons.map((reason) => ({
      key: reason.key,
      label: reason.label,
      action: reasonActionLabel(reason.key),
      href: reasonActionHref(row.clientId, reason.key),
    })),
  }));
}

/** How many pieces of work the board holds — the line under its heading. */
export function reviewTaskCount(rows: readonly NeedsAttentionRow[]): number {
  return rows.reduce((sum, row) => sum + row.reasons.length, 0);
}

/* ------------------------------------------------------------------ family */

/**
 * One open chore, worded for the person who owes it. No stage, no pipeline, no lead:
 * a family is not a record moving through an office (hard fail 2 on the taste bar).
 */
export type WaitingItem = {
  key: keyof ChecklistCounts;
  /** "Forms", "Agreement" — the same word Home's card uses. */
  title: string;
  /** "3 forms to fill in" — the ask, in a sentence. */
  ask: string;
  /** The card's own second line, so the two surfaces agree. */
  detail: string;
  href: string;
  /** "Open forms" — the button on the row. */
  action: string;
  tone: "coral" | "ink";
  locked?: boolean;
};

export type WaitingBoard = {
  /** "9 things waiting for you" — the same summary Home prints. */
  summary: string;
  /** Chores still owed, in checklist order. */
  open: WaitingItem[];
  /** Resources and visits: worth a look, never homework. */
  alsoHere: WaitingItem[];
  /** Chores already cleared, so the board can say what is finished. */
  done: WaitingItem[];
};

type WaitingCopy = {
  action: string;
  /** The ask while the chore is open. */
  open: (count: number, doula: string) => string;
  /** What the row says once it is clear. */
  clear: (doula: string) => string;
};

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

const WAITING_COPY: Record<keyof ChecklistCounts, WaitingCopy> = {
  incompleteForms: {
    action: "Open forms",
    open: (count) => `${plural(count, "form")} to fill in`,
    clear: () => "Your forms are all in",
  },
  unsignedContracts: {
    action: "Read the agreement",
    open: (count) => `${plural(count, "agreement")} to read and sign`,
    clear: () => "Your agreement is signed",
  },
  openInvoices: {
    action: "Go to Pay",
    open: (count) => `${plural(count, "invoice")} open`,
    clear: () => "Nothing to pay right now",
  },
  unreadMessages: {
    action: "Open messages",
    open: (count, doula) => `${plural(count, "unread message")} from ${doula}`,
    clear: (doula) => `No new messages from ${doula}`,
  },
  openResources: {
    action: "Open resources",
    open: (count, doula) => `${plural(count, "new handout")} from ${doula}`,
    clear: () => "You have read everything shared so far",
  },
  upcomingConsults: {
    action: "See your visits",
    open: (count, doula) => `${plural(count, "visit")} booked with ${doula}`,
    clear: (doula) => `Nothing booked with ${doula} yet`,
  },
};

function waitingItem(card: ChecklistCard, doulaName: string): WaitingItem {
  const copy = WAITING_COPY[card.key];
  return {
    key: card.key,
    title: card.label,
    // A locked shelf keeps its own words — Home says when it opens, and so does this
    // (TOK-39 E2): a family should never be told to go read handouts she cannot open.
    ask: card.locked
      ? card.countLabel
      : card.count > 0
        ? copy.open(card.count, doulaName)
        : copy.clear(doulaName),
    detail: card.detail,
    href: card.href,
    action: copy.action,
    tone: card.tone,
    locked: card.locked,
  };
}

/**
 * The waiting board, built from the six Home cards rather than beside them.
 *
 * `doulaName` is the resolved assigned doula — "Priya Raman" — for the same reason every
 * other family surface takes it: "your doula" is a person the portal already knows the
 * name of (hard fail 3).
 */
export function waitingBoard(
  counts: ChecklistCounts,
  doulaName = "your care team",
  options: { resourcesLocked?: boolean } = {},
): WaitingBoard {
  const cards = checklistCards(counts, doulaName, options);
  const open: WaitingItem[] = [];
  const alsoHere: WaitingItem[] = [];
  const done: WaitingItem[] = [];

  for (const card of cards) {
    const item = waitingItem(card, doulaName);
    // `actionable` is the checklist's own idea of a chore: forms, agreement, pay, unread.
    // Resources and visits are context, so they sit apart instead of inflating the queue.
    if (card.actionable) open.push(item);
    else if (card.key === "openResources" || card.key === "upcomingConsults") alsoHere.push(item);
    else done.push(item);
  }

  return { summary: checklistSummary(counts), open, alsoHere, done };
}

export function waitingQueueLink(counts: ChecklistCounts): QueueLink {
  return { href: WAITING_BOARD_HREF, label: checklistSummary(counts) };
}
