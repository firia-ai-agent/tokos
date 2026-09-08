export type PaymentOutcome = "paid" | "failed" | "canceled" | "refunded" | "voided";

const UNCLEARED_PAYMENT = new Set(["due", "failed", "canceled", "refunded", "voided"]);
const UNCLEARED_INVOICE = new Set(["open", "failed", "canceled", "refunded", "voided"]);

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
  paid: boolean;
  metadata?: Record<string, string> | null;
  amountTotalCents?: number | null;
  currency?: string | null;
};

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
 */
export function checkoutBindingError(
  session: CheckoutSessionFacts,
  invoice: InvoiceFacts,
): "mismatch" | "unpaid" | null {
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
  if (!session.paid) return "unpaid";
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
    return { paymentStatus: outcome, invoiceStatus: "open", paymentCleared: false };
  }
  return { paymentStatus: outcome, invoiceStatus: outcome, paymentCleared: false };
}
