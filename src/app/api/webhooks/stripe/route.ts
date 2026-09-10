import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { getDb } from "@/db";
import { invoices } from "@/db/schema";
import { markInvoicePaid, recordPaymentFailure } from "@/lib/funnel";
import { hasStripe } from "@/lib/env";
import { checkoutBindingError } from "@/lib/payment";

/** Every Checkout event that says something about money we can act on (TOK-48). */
const HANDLED = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
]);

/**
 * Stripe is the source of truth for payment state, so the DB has to mirror it in both
 * directions (TOK-48). Marking paid goes through the same `checkoutBindingError` the
 * return route uses — same amount, same currency, same org, and `payment_status: "paid"`
 * — so a completed-but-unsettled session cannot clear an invoice. The failure events
 * write the failure without touching the invoice: `recordPaymentFailure` leaves it open,
 * which is what keeps the family's balance Due instead of quietly Paid.
 */
export async function POST(request: Request) {
  if (!hasStripe() || !process.env.STRIPE_WEBHOOK_SECRET) {
    return Response.json({ ok: true, stub: true });
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "missing signature" }, { status: 400 });

  const event = stripe.webhooks.constructEvent(
    body,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET,
  );

  if (HANDLED.has(event.type)) {
    const session = event.data.object as Stripe.Checkout.Session;
    const invoiceId = session.metadata?.invoice_id;
    if (invoiceId) {
      const db = getDb();
      const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
      if (invoice) {
        const binding = checkoutBindingError(
          {
            paid: session.payment_status === "paid",
            paymentStatus: session.payment_status,
            status: session.status,
            metadata: (session.metadata ?? {}) as Record<string, string>,
            amountTotalCents: session.amount_total,
            currency: session.currency,
          },
          invoice,
        );

        if (binding === null) {
          await markInvoicePaid({
            organizationId: invoice.organizationId,
            invoiceId,
            externalId: session.id,
          });
        } else if (
          binding !== "mismatch" &&
          invoice.status !== "paid" &&
          (event.type === "checkout.session.async_payment_failed" ||
            event.type === "checkout.session.expired")
        ) {
          // The charge is over and no money arrived. Record which way it ended; the
          // invoice stays open, so the portal keeps showing Due rather than Paid.
          await recordPaymentFailure({
            organizationId: invoice.organizationId,
            invoiceId,
            outcome: event.type === "checkout.session.expired" ? "canceled" : "failed",
            externalId: session.id,
          });
        }
      }
    }
  }

  return Response.json({ received: true });
}
