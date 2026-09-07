import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { invoices } from "@/db/schema";
import { markInvoicePaid } from "@/lib/funnel";
import { DemoBanner } from "@/components/brand/shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents } from "@/lib/money";

async function completeStubPay(formData: FormData) {
  "use server";
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const db = getDb();
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!invoice) redirect("/portal");
  await markInvoicePaid({
    organizationId: invoice.organizationId,
    invoiceId,
    externalId: `stub-checkout-${invoiceId}`,
  });
  redirect("/portal?paid=1");
}

export default async function StubPayPage({
  searchParams,
}: {
  searchParams: Promise<{ invoiceId?: string }>;
}) {
  const { invoiceId } = await searchParams;
  if (!invoiceId) redirect("/portal");
  const db = getDb();
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!invoice) redirect("/portal");

  return (
    <div className="min-h-screen">
      <DemoBanner />
      <main className="mx-auto max-w-lg px-4 py-16">
        <Card>
          <CardHeader>
            <CardTitle>Pay invoice {invoice.number}</CardTitle>
            <CardDescription>
              Stripe Checkout stub. Live mode uses Checkout / PaymentIntents. Metadata carries
              ids only — never notes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-2xl font-heading text-teal-ink">
              {formatCents(invoice.amountCents, invoice.currency)}
            </p>
            <form action={completeStubPay}>
              <input type="hidden" name="invoiceId" value={invoiceId} />
              <Button type="submit" className="w-full">
                Pay and return
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
