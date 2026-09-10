export type PaymentOutcome = "paid" | "failed" | "canceled" | "refunded" | "voided";

/**
 * Money that has not landed, in every spelling either table uses. `pending` is here for
 * the delayed methods Stripe settles hours later (TOK-48): a session can be `complete`
 * while the bank debit is still in flight, and that is not a payment yet.
 */
const UNCLEARED_PAYMENT = new Set([
  "due",
  "pending",
  "failed",
  "canceled",
  "refunded",
  "voided",
]);
const UNCLEARED_INVOICE = new Set([
  "open",
  "pending",
  "failed",
  "canceled",
  "refunded",
  "voided",
]);

/** True only when money is actually cleared. Failed/canceled/refund/void never count. */
export function isPaymentCleared(input: {
  paymentStatus?: string | null;
  invoiceStatus?: string | null;
}): boolean {
  if (input.paymentStatus && UNCLEARED_PAYMENT.has(input.paymentStatus)) {
    return false;
  }
  if (input.invoiceStatus && UNCLEARED_INVOICE.has(input.invoiceStatus)) {
    return false;
  }
  return input.paymentStatus === "cleared" || input.invoiceStatus === "paid";
}

export type CheckoutSessionFacts = {
  /** Legacy boolean the stub adapter still answers with; `paymentStatus` outranks it. */
  paid?: boolean;
  /** Stripe `checkout.session.payment_status` — `paid` | `unpaid` | `no_payment_required`. */
  paymentStatus?: string | null;
  /** Stripe `checkout.session.status` — `open` | `complete` | `expired`. */
  status?: string | null;
  metadata?: Record<string, string> | null;
  amountTotalCents?: number | null;
  currency?: string | null;
};

/** What Stripe says about the money, reduced to the three states we can say out loud. */
export type CheckoutPaymentTruth = "paid" | "pending" | "unpaid";

/**
 * Read the session the way Stripe means it (TOK-48).
 *
 * Only the literal `paid` counts as money. A `complete` session whose payment has not
 * landed is a delayed method still clearing — `pending`, which is honest and is still
 * not paid. Everything else, including a status string we have never seen, is `unpaid`;
 * an unknown code must fall to the safe side, because the expensive mistake here is
 * calling an unsettled charge paid.
 */
export function checkoutPaymentTruth(session: CheckoutSessionFacts): CheckoutPaymentTruth {
  const declared = session.paymentStatus?.trim().toLowerCase();
  if (declared) {
    if (declared === "paid") return "paid";
    return session.status?.trim().toLowerCase() === "complete" ? "pending" : "unpaid";
  }
  // No `payment_status` at all: the stub adapter's boolean, and nothing more generous.
  return session.paid === true ? "paid" : "unpaid";
}

export type InvoiceFacts = {
  id: string;
  organizationId: string;
  amountCents: number;
  currency: string;
};

/**
 * Why a returned Checkout session may not settle this invoice, or null when it binds (TOK-21).
 * A `session_id` only counts for the invoice its own metadata names, in the same org, for the
 * invoice's amount and currency — otherwise one paid session could clear any other invoice.
 *
 * Binding is still checked before the money (TOK-48), so a stray session never reports its
 * own payment state for an invoice it has nothing to do with. A bound-but-unsettled session
 * separates `pending` from `unpaid` so the family gets the true sentence; neither settles.
 */
export function checkoutBindingError(
  session: CheckoutSessionFacts,
  invoice: InvoiceFacts,
): "mismatch" | "unpaid" | "pending" | null {
  const metadata = session.metadata ?? {};
  if (metadata.invoice_id !== invoice.id) return "mismatch";
  if (metadata.organization_id !== invoice.organizationId) return "mismatch";
  if (session.amountTotalCents != null && session.amountTotalCents !== invoice.amountCents) {
    return "mismatch";
  }
  if (
    session.currency != null &&
    session.currency.toLowerCase() !== invoice.currency.toLowerCase()
  ) {
    return "mismatch";
  }
  const truth = checkoutPaymentTruth(session);
  if (truth !== "paid") return truth;
  return null;
}

export function paymentOutcomeStatuses(outcome: PaymentOutcome): {
  paymentStatus: string;
  invoiceStatus: string;
  paymentCleared: boolean;
} {
  if (outcome === "paid") {
    return { paymentStatus: "cleared", invoiceStatus: "paid", paymentCleared: true };
  }
  if (outcome === "failed" || outcome === "canceled") {
    // The bill survives the failure: a declined card leaves the family owing, not settled.
    return { paymentStatus: outcome, invoiceStatus: "open", paymentCleared: false };
  }
  return { paymentStatus: outcome, invoiceStatus: outcome, paymentCleared: false };
}
