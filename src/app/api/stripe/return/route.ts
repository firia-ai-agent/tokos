import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { invoices } from "@/db/schema";
import { retrieveCheckoutSession } from "@/lib/adapters/stripe";
import { markInvoicePaid } from "@/lib/funnel";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const invoiceId = url.searchParams.get("invoiceId");
  const sessionId = url.searchParams.get("session_id");
  if (!invoiceId) {
    return Response.redirect(new URL("/portal", request.url));
  }
  if (sessionId) {
    const session = await retrieveCheckoutSession(sessionId);
    if (!session.paid) {
      return Response.redirect(new URL("/portal/pay?unpaid=1", request.url));
    }
  }
  const db = getDb();
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (invoice) {
    await markInvoicePaid({
      organizationId: invoice.organizationId,
      invoiceId,
      externalId: sessionId ?? undefined,
    });
  }
  return Response.redirect(new URL("/portal?paid=1", request.url));
}
