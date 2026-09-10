import { isPaymentCleared } from "@/lib/payment";

/**
 * Family wording for the two status columns a client actually sees (TOK-41).
 *
 * `contracts.status` and `invoices.status` are operational codes — `sent`, `open` — and
 * rendering them raw is the same mistake as showing a family "new lead": accurate to the
 * database, useless to the person reading it. "Sent" tells a family what the office did;
 * "Ready to sign" tells them what is theirs to do next.
 *
 * The DB values are unchanged. Staff surfaces keep the codes, which is why these maps
 * live here and not in a shared formatter.
 */

/** Coral means "yours to do"; ink means "nothing owed". */
export type ClientStatusTone = "coral" | "ink";

export type ClientStatus = {
  label: string;
  tone: ClientStatusTone;
};

const CONTRACT_STATUSES: Record<string, ClientStatus> = {
  // A draft is not the family's turn yet, and saying "draft" invites them to look for it.
  draft: { label: "Being prepared", tone: "ink" },
  sent: { label: "Ready to sign", tone: "coral" },
  signed: { label: "Signed", tone: "ink" },
  complete: { label: "Complete", tone: "ink" },
  void: { label: "Withdrawn", tone: "ink" },
};

/**
 * "Paid" is reserved (TOK-48). Every status other than a cleared one gets its own honest
 * word, because the failure mode here is not a clumsy label — it is a family being told
 * their declined card went through. A code we do not recognise falls back to "Due".
 */
const INVOICE_STATUSES: Record<string, ClientStatus> = {
  open: { label: "Due", tone: "coral" },
  paid: { label: "Paid", tone: "ink" },
  void: { label: "Cancelled", tone: "ink" },
  voided: { label: "Cancelled", tone: "ink" },
  canceled: { label: "Cancelled", tone: "ink" },
  refunded: { label: "Refunded", tone: "ink" },
  // A payment can fail while the bill stands, so this one is still the family's turn.
  failed: { label: "Payment failed", tone: "coral" },
  pending: { label: "Payment pending", tone: "ink" },
};

/**
 * An unknown code falls back to the quietest honest thing rather than echoing the code —
 * a family should never be the one to discover a new status string.
 */
export function contractStatusLabel(status: string): ClientStatus {
  return CONTRACT_STATUSES[status] ?? { label: "Being prepared", tone: "ink" };
}

export function invoiceStatusLabel(status: string): ClientStatus {
  return INVOICE_STATUSES[status] ?? { label: "Due", tone: "coral" };
}

/**
 * What the pay page shows for one invoice (TOK-48).
 *
 * The bug this replaces was a two-branch ternary — `open` meant a pay button, and
 * *everything else* meant "Paid — thank you." A voided, refunded, pending or failed
 * invoice therefore told the family their money had landed. One helper decides now, so
 * the badge, the body copy and the button cannot drift apart, and so the branch is
 * testable without mounting the page.
 *
 * `action: "pay"` is the only thing that renders the card form; `body` is the sentence
 * under the amount, or null when the button says it all.
 */
export type InvoicePayPanel = {
  action: "pay" | "none";
  body: string | null;
  badge: ClientStatus;
  /** True only when money actually cleared — the sole gate on "Paid" wording. */
  cleared: boolean;
};

/** The whole point of the ticket: this string has exactly one caller condition. */
const PAID_BODY = "Paid — thank you.";

export function invoicePayPanel(input: {
  invoiceStatus: string;
  /** `payment_statuses.status` for the invoice's contract, when there is one. */
  paymentStatus?: string | null;
}): InvoicePayPanel {
  const paymentStatus = input.paymentStatus ?? null;

  // One truth for "did the money land", shared with the funnel and the resource gate.
  if (isPaymentCleared({ invoiceStatus: input.invoiceStatus, paymentStatus })) {
    return { action: "none", body: PAID_BODY, badge: invoiceStatusLabel("paid"), cleared: true };
  }

  // Not cleared, but the invoice row still says `paid`: the two tables have drifted, and
  // the payment row is the one that touched the money. Read the invoice through it rather
  // than through the word "paid", which we have just established is not true.
  const status =
    input.invoiceStatus === "paid" && paymentStatus ? paymentStatus : input.invoiceStatus;

  const badge = uncleared(invoiceStatusLabel(status));

  // Still owed, including after a declined card: `recordPaymentFailure` deliberately
  // leaves the invoice open, so the family keeps a working Pay button.
  if (status === "open" || status === "failed") {
    return { action: "pay", body: null, badge, cleared: false };
  }
  if (status === "refunded") {
    return { action: "none", body: "Refunded — nothing is owed.", badge, cleared: false };
  }
  if (status === "void" || status === "voided" || status === "canceled") {
    return { action: "none", body: "Cancelled — nothing is owed.", badge, cleared: false };
  }
  if (status === "pending") {
    return {
      action: "none",
      body: "Payment pending — we will confirm here as soon as it clears.",
      badge,
      cleared: false,
    };
  }

  // An unknown code is not an invitation to guess "Paid". Match the badge, which reads
  // Due, and leave the family a way to settle it.
  return { action: "pay", body: null, badge, cleared: false };
}

/** Belt and braces: no uncleared invoice can wear the Paid badge, whatever its code says. */
function uncleared(status: ClientStatus): ClientStatus {
  return status.label === "Paid" ? INVOICE_STATUSES.open : status;
}
