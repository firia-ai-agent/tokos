import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { getDb } from "@/db";
import { invoices } from "@/db/schema";
import { markInvoicePaid } from "@/lib/funnel";
import { hasStripe } from "@/lib/env";

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

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const invoiceId = session.metadata?.invoice_id;
    if (invoiceId && session.payment_status === "paid") {
      const db = getDb();
      const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
      if (invoice) {
        await markInvoicePaid({
          organizationId: invoice.organizationId,
          invoiceId,
          externalId: session.id,
        });
      }
    }
  }

  return Response.json({ received: true });
}
