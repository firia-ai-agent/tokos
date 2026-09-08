import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { invoices } from "@/db/schema";
import { markInvoicePaid, recordPaymentFailure } from "@/lib/funnel";
import { clientOwnsRow } from "@/lib/ownership";
import { requireClientPage } from "@/lib/tenancy";
import { DemoBanner } from "@/components/brand/shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents } from "@/lib/money";

function failOutcome(raw: FormData | string | undefined): "failed" | "canceled" {
  const value = typeof raw === "string" ? raw : String(raw?.get("outcome") ?? "failed");
  return value === "canceled" ? "canceled" : "failed";
}

async function completeStubPay(formData: FormData) {
  "use server";
  const session = await requireClientPage();
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const db = getDb();
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!invoice || !clientOwnsRow(session, invoice)) redirect("/portal");
  await markInvoicePaid({
    organizationId: session.organizationId,
    invoiceId,
    externalId: `stub-checkout-${invoiceId}`,
    actorUserId: session.userId,
  });
  redirect("/portal?paid=1");
}

async function failStubPay(formData: FormData) {
  "use server";
  const session = await requireClientPage();
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const outcome = failOutcome(formData);
  const db = getDb();
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!invoice || !clientOwnsRow(session, invoice)) redirect("/portal");
  await recordPaymentFailure({
    organizationId: session.organizationId,
    invoiceId,
    outcome,
    actorUserId: session.userId,
    externalId: `stub-${outcome}-${invoiceId}`,
  });
  redirect(`/portal/pay?unpaid=1&result=${outcome}`);
}

export default async function StubPayPage({
  searchParams,
}: {
  searchParams: Promise<{ invoiceId?: string; result?: string; fail?: string }>;
}) {
  const session = await requireClientPage();
  const { invoiceId, result, fail } = await searchParams;
  if (!invoiceId) redirect("/portal");
  const db = getDb();
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.organizationId, session.organizationId)))
    .limit(1);
  if (!invoice || !clientOwnsRow(session, invoice)) redirect("/portal");

  const demoFail = fail === "1" || result === "fail" || result === "failed" || result === "canceled";
  const outcome = result === "canceled" ? "canceled" : "failed";

  return (
    <div className="min-h-screen">
      <DemoBanner />
      <main className="mx-auto max-w-lg px-4 py-16">
        <Card>
          <CardHeader>
            <CardTitle>Pay invoice {invoice.number}</CardTitle>
            <CardDescription>
              Stripe Checkout stub. Live mode uses Checkout / PaymentIntents. Metadata carries
              ids only — never notes. You must be signed in as this client.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-2xl font-heading text-teal-ink">
              {formatCents(invoice.amountCents, invoice.currency)}
            </p>
            {demoFail ? (
              <p className="text-sm text-muted-foreground">
                Demo fail path (`result={outcome}`). This does not clear payment or complete the
                contract.
              </p>
            ) : null}
            <form action={completeStubPay}>
              <input type="hidden" name="invoiceId" value={invoiceId} />
              <Button type="submit" className="w-full">
                Pay and return
              </Button>
            </form>
            <form action={failStubPay}>
              <input type="hidden" name="invoiceId" value={invoiceId} />
              <input type="hidden" name="outcome" value={outcome} />
              <Button type="submit" variant="outline" className="w-full">
                Simulate {outcome} payment
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
