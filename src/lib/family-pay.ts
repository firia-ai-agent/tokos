/**
 * The family's side of the money (TOK-55).
 *
 * The founder's ask on `/portal/pay` was specific: outstanding invoices the moment the
 * page opens, opened one at a time, and a payment history you can go and look at. This
 * module decides which invoice belongs in which of those two places, and supplies the
 * sentences — all of them naming the doula, none of them staff vocabulary.
 *
 * The Paid rule is `invoicePayPanel`'s, which is `isPaymentCleared`'s (TOK-48). A failed
 * card, a refund, a bank debit still in flight: none of them may read as a payment, and
 * the split below is derived from the panel rather than from a second status test.
 */

import { invoicePayPanel, type InvoicePayPanel } from "@/lib/client-status";
import { isPaymentCleared } from "@/lib/payment";

export type FamilyInvoiceLine = {
  id: string;
  description: string;
  quantity: number;
  unitAmountCents: number;
};

export type FamilyInvoice = {
  id: string;
  number: string;
  /** `invoices.status` — never rendered raw to a family. */
  status: string;
  /** `payment_statuses.status` for this invoice's contract, when there is one. */
  paymentStatus: string | null;
  amountCents: number;
  currency: string;
  issuedAt: Date;
  dueAt: Date | null;
  paidAt: Date | null;
  packageLabel: string | null;
  lines: readonly FamilyInvoiceLine[];
};

export type FamilyPayItem = {
  invoice: FamilyInvoice;
  panel: InvoicePayPanel;
  /** True when the money has landed. The only thing allowed to print "Paid". */
  cleared: boolean;
};

export type FamilyPayGroups = {
  /** Anything still hers to settle — due, declined, or clearing. Newest debt first. */
  outstanding: FamilyPayItem[];
  /** Everything that has finished: cleared, refunded, cancelled. Most recent first. */
  history: FamilyPayItem[];
  outstandingCents: number;
  clearedCents: number;
};

const CLOSED = new Set(["refunded", "canceled", "cancelled", "void", "voided"]);

function settled(invoice: FamilyInvoice): boolean {
  if (isPaymentCleared({ invoiceStatus: invoice.status, paymentStatus: invoice.paymentStatus })) {
    return true;
  }
  // A refunded or cancelled bill is finished too — nothing is owed, so it belongs in the
  // record of what happened rather than in the list of what to do.
  if (invoice.paymentStatus && CLOSED.has(invoice.paymentStatus)) return true;
  return CLOSED.has(invoice.status);
}

export function familyPayGroups(invoices: readonly FamilyInvoice[]): FamilyPayGroups {
  const groups: FamilyPayGroups = {
    outstanding: [],
    history: [],
    outstandingCents: 0,
    clearedCents: 0,
  };
  for (const invoice of invoices) {
    const panel = invoicePayPanel({
      invoiceStatus: invoice.status,
      paymentStatus: invoice.paymentStatus,
    });
    const item: FamilyPayItem = { invoice, panel, cleared: panel.cleared };
    if (settled(invoice)) {
      groups.history.push(item);
      if (panel.cleared) groups.clearedCents += invoice.amountCents;
    } else {
      groups.outstanding.push(item);
      groups.outstandingCents += invoice.amountCents;
    }
  }
  // Oldest debt first: the one that has been waiting longest is the one to open.
  groups.outstanding.sort((a, b) => sortKey(a) - sortKey(b));
  groups.history.sort((a, b) => historyKey(b) - historyKey(a));
  return groups;
}

function sortKey(item: FamilyPayItem): number {
  return (item.invoice.dueAt ?? item.invoice.issuedAt).getTime();
}

function historyKey(item: FamilyPayItem): number {
  return (item.invoice.paidAt ?? item.invoice.issuedAt).getTime();
}

/** True when this one should be open on arrival — the family should not have to hunt. */
export function opensByDefault(groups: FamilyPayGroups, index: number): boolean {
  return index === 0 && groups.outstanding.length > 0;
}

export type DueTone = "coral" | "ink";

/**
 * The line under the amount on an outstanding card. Late says how late, because "Due
 * Aug 30" on the twelfth of September is a date, not information.
 */
export function dueNote(
  invoice: Pick<FamilyInvoice, "dueAt">,
  now: Date,
  formatDate: (value: Date) => string,
): { text: string; tone: DueTone } {
  if (!invoice.dueAt) return { text: "No due date set", tone: "ink" };
  const days = Math.round((invoice.dueAt.getTime() - now.getTime()) / 86_400_000);
  if (days < 0) {
    const late = Math.abs(days);
    return {
      text: late === 1 ? "Due yesterday" : `${late} days past due`,
      tone: "coral",
    };
  }
  if (days === 0) return { text: "Due today", tone: "coral" };
  if (days === 1) return { text: "Due tomorrow", tone: "coral" };
  return { text: `Due ${formatDate(invoice.dueAt)}`, tone: "ink" };
}

/**
 * The family portal's words for this page, built around the doula who is actually hers.
 * "Your doula" is the failure mode these take out (TOK-41): if Tokos knows it is Priya,
 * the page says Priya.
 */
export function familyPayCopy(doula: { name: string; firstName: string }) {
  return {
    title: "Pay",
    subtitle: `Everything ${doula.firstName} has invoiced you for, and everything you have already settled.`,
    outstandingHeading: "Outstanding",
    outstandingHint: "Open one to see what it covers, then pay it by card.",
    historyHeading: "Payment history",
    historyHint: "Every invoice that has finished — settled, refunded or cancelled.",
    detailsLabel: "What this covers",
    payLabel: "Pay with card",
    // Bank debit is not wired. Naming a method a family cannot use would be the same
    // dead chrome as a button that goes nowhere, so the card is offered and the rest is
    // an honest sentence about who to ask.
    otherMethods: `Paying another way — a cheque or a transfer? Write ${doula.firstName} and she will record it against this invoice.`,
    nothingDue: {
      title: "Nothing due",
      body: `You are settled up. ${doula.name} will let you know here if anything else is owed.`,
    },
    noInvoices: {
      title: "Nothing due",
      body: `${doula.name} sends an invoice here once your care agreement goes out.`,
    },
    noHistory: {
      title: "No payments yet",
      body: `Once a payment clears, it stays here with the date ${doula.firstName} received it.`,
    },
    issuedLabel: "Invoiced",
    paidLabel: "Paid on",
    totalDueLabel: "Total outstanding",
    totalPaidLabel: "Paid to date",
  };
}

/** "1 invoice" / "3 invoices", in the family's voice rather than the staff table's. */
export function familyInvoiceCount(count: number): string {
  return `${count} ${count === 1 ? "invoice" : "invoices"}`;
}

/**
 * Lines to show inside an opened invoice. An invoice raised from a care agreement has one
 * line already; one with no lines at all falls back to the package it came from rather
 * than showing a family an empty table.
 */
export function displayLines(invoice: FamilyInvoice): FamilyInvoiceLine[] {
  if (invoice.lines.length > 0) return [...invoice.lines];
  return [
    {
      id: `${invoice.id}-fallback`,
      description: invoice.packageLabel ?? "Doula care",
      quantity: 1,
      unitAmountCents: invoice.amountCents,
    },
  ];
}
