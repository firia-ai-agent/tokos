import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { invoices } from "@/db/schema";
import { retrieveCheckoutSession } from "@/lib/adapters/stripe";
import { markInvoicePaid } from "@/lib/funnel";
import { auth } from "@/auth";
import { hasStripe } from "@/lib/env";
import { clientOwnsRow } from "@/lib/ownership";
import { checkoutBindingError } from "@/lib/payment";

/**
 * Stripe Checkout return. Bare `?invoiceId=` never marks paid, and a `session_id` only
 * settles the invoice its own metadata names, for that amount and currency (TOK-21).
 * Demo stub pay completes only from the authenticated /stub/pay form.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const invoiceId = url.searchParams.get("invoiceId");
  const sessionId = url.searchParams.get("session_id");
  const login = new URL("/login", request.url);

  const session = await auth();
  const user = session?.user;
  if (!user?.id || user.actorType !== "client" || !user.clientId || !user.organizationId) {
    return Response.redirect(login);
  }
  if (!invoiceId) {
    return Response.redirect(new URL("/portal", request.url));
  }

  const db = getDb();
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.organizationId, user.organizationId)))
    .limit(1);

  if (!invoice || !clientOwnsRow({ organizationId: user.organizationId, clientId: user.clientId }, invoice)) {
    return Response.redirect(new URL("/portal", request.url));
  }

  if (!hasStripe() || !sessionId) {
    return Response.redirect(new URL("/portal/pay", request.url));
  }

  const checkout = await retrieveCheckoutSession(sessionId);
  const binding = checkoutBindingError(checkout, invoice);
  if (binding === "mismatch") {
    return Response.redirect(new URL("/portal/pay?unpaid=1&result=unverified", request.url));
  }
  if (binding === "unpaid") {
    return Response.redirect(new URL("/portal/pay?unpaid=1", request.url));
  }

  await markInvoicePaid({
    organizationId: user.organizationId,
    invoiceId,
    externalId: sessionId,
    actorUserId: user.id,
  });
  return Response.redirect(new URL("/portal?paid=1", request.url));
}
