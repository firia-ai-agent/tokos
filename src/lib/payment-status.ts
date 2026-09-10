/**
 * The one row that says what an invoice's money did (TOK-61).
 *
 * `payment_statuses` grew out of the care-agreement funnel, so it hung off `contracts`
 * and `sendContract` was the only thing that ever wrote it. A hand-raised invoice
 * (TOK-55) has no contract, so it got no payment row — and with nowhere to record a
 * decline, a refund or a debit still in flight, `/portal/pay` and the staff dashboard
 * could only ever read it back as "due". `isPaymentCleared` was right to refuse to call
 * an open invoice paid; it simply had nothing to read.
 *
 * Every writer and every reader goes through this module so the two spellings of the same
 * fact — a row anchored to the invoice, and a pre-TOK-61 row anchored only to its
 * contract — can never be resolved two different ways.
 *
 * This decides *where the row lives*, never whether money landed. `isPaymentCleared` and
 * `checkoutPaymentTruth` in `@/lib/payment` remain the only things allowed to say Paid.
 */

import { and, eq, isNull, or, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { invoices, paymentStatuses } from "@/db/schema";
import { newId } from "@/lib/ids";

/** The two ways an invoice can own its payment row. Both are matched, always. */
export type PaymentStatusAnchor = {
  id: string;
  contractId: string | null;
};

/**
 * Matches the payment row for one invoice by invoice id, falling back to its contract for
 * rows written before TOK-61 moved the anchor. `contractId` is only compared when the
 * invoice has one — otherwise `NULL = NULL` would quietly match nothing while looking
 * like it matched, and a hand invoice would silently keep its old blank behaviour.
 */
export function paymentStatusForInvoice(invoice: PaymentStatusAnchor): SQL {
  const byInvoice = eq(paymentStatuses.invoiceId, invoice.id);
  if (!invoice.contractId) return byInvoice;
  return or(byInvoice, eq(paymentStatuses.contractId, invoice.contractId))!;
}

/**
 * The same match as a join condition against the `invoices` table, for the dashboard and
 * pay-page reads. A legacy row joins through the contract; everything written since joins
 * straight to the invoice it belongs to.
 */
export function paymentStatusJoin(): SQL {
  return or(
    eq(paymentStatuses.invoiceId, invoices.id),
    and(eq(paymentStatuses.contractId, invoices.contractId), isNull(paymentStatuses.invoiceId)),
  )!;
}

/**
 * Opens the payment row for a freshly raised invoice.
 *
 * Deliberately `due` and never cleared: raising a bill is not receiving money. Both the
 * contract funnel and the hand-invoice action call this, which is the point — the two
 * paths used to write different shapes, and the hand one wrote nothing at all.
 *
 * Idempotent, because a retried action must not leave a family with two payment rows
 * against one bill.
 */
export async function openPaymentStatus(input: {
  organizationId: string;
  invoiceId: string;
  contractId?: string | null;
  amountCents: number;
  method?: string;
  status?: string;
}): Promise<void> {
  const db = getDb();
  const [existing] = await db
    .select({ id: paymentStatuses.id })
    .from(paymentStatuses)
    .where(
      and(
        eq(paymentStatuses.organizationId, input.organizationId),
        paymentStatusForInvoice({ id: input.invoiceId, contractId: input.contractId ?? null }),
      ),
    )
    .limit(1);
  if (existing) return;

  await db.insert(paymentStatuses).values({
    id: newId(),
    organizationId: input.organizationId,
    contractId: input.contractId ?? null,
    invoiceId: input.invoiceId,
    method: input.method ?? "stripe",
    status: input.status ?? "due",
    amountCents: input.amountCents,
  });
}

/**
 * Moves an invoice's payment row to what the money just did.
 *
 * The caller has already decided the outcome — this only writes it, and only to the row
 * that belongs to this invoice. A pre-TOK-61 invoice whose row was never opened is
 * backfilled rather than skipped, so the fact is recorded on the first payment event
 * instead of being lost for want of a row.
 */
export async function setPaymentStatusForInvoice(input: {
  organizationId: string;
  invoice: PaymentStatusAnchor & { amountCents: number };
  status: string;
  method: string;
  externalId?: string | null;
  clearedAt: Date | null;
}): Promise<void> {
  const db = getDb();
  const updated = await db
    .update(paymentStatuses)
    .set({
      status: input.status,
      method: input.method,
      externalId: input.externalId ?? null,
      clearedAt: input.clearedAt,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(paymentStatuses.organizationId, input.organizationId),
        paymentStatusForInvoice(input.invoice),
      ),
    )
    .returning({ id: paymentStatuses.id });
  if (updated.length > 0) return;

  await db.insert(paymentStatuses).values({
    id: newId(),
    organizationId: input.organizationId,
    contractId: input.invoice.contractId,
    invoiceId: input.invoice.id,
    method: input.method,
    status: input.status,
    amountCents: input.invoice.amountCents,
    externalId: input.externalId ?? null,
    clearedAt: input.clearedAt,
  });
}
