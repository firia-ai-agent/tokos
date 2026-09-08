import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { invoices } from "@/db/schema";
import { requireClient } from "@/lib/tenancy";
import { payInvoiceAction } from "@/app/actions/client";
import { formatCents } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/brand/states";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default async function PayPage({
  searchParams,
}: {
  searchParams: Promise<{ unpaid?: string; result?: string }>;
}) {
  const session = await requireClient();
  const { unpaid, result } = await searchParams;
  const db = getDb();
  const rows = await db
    .select()
    .from(invoices)
    .where(
      and(eq(invoices.organizationId, session.organizationId), eq(invoices.clientId, session.clientId)),
    );

  if (rows.length === 0) {
    return <EmptyState title="No invoices" body="An invoice appears when a contract is sent." />;
  }

  return (
    <div className="space-y-4">
      <h2 className="font-heading text-2xl text-teal-ink">Pay</h2>
      {unpaid ? (
        <Alert>
          <AlertDescription>
            Payment was not completed{result ? ` (${result})` : ""}. The invoice is still due —
            it is not paid or cleared, and the contract does not become complete.
          </AlertDescription>
        </Alert>
      ) : null}
      {rows.map((invoice) => (
        <div key={invoice.id} className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between">
            <p className="font-medium">{invoice.number}</p>
            <Badge>{invoice.status}</Badge>
          </div>
          <p className="font-heading text-2xl text-teal-ink">
            {formatCents(invoice.amountCents, invoice.currency)}
          </p>
          {invoice.status === "open" ? (
            <form action={payInvoiceAction.bind(null, invoice.id)} className="mt-3">
              <Button type="submit">Pay with card</Button>
            </form>
          ) : (
            <p className="mt-2 text-sm text-teal">Paid</p>
          )}
        </div>
      ))}
    </div>
  );
}
