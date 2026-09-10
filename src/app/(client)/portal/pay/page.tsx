import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { invoices, paymentStatuses } from "@/db/schema";
import { requireClient } from "@/lib/tenancy";
import { resolveAssignedDoulaName } from "@/lib/assigned-doula";
import { payInvoiceAction } from "@/app/actions/client";
import { invoicePayPanel } from "@/lib/client-status";
import { formatCents } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/brand/states";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default async function PayPage({
  searchParams,
}: {
  searchParams: Promise<{ unpaid?: string; pending?: string; result?: string }>;
}) {
  const session = await requireClient();
  const { unpaid, pending, result } = await searchParams;
  const doula = await resolveAssignedDoulaName({
    organizationId: session.organizationId,
    clientId: session.clientId,
  });
  const db = getDb();
  // The payment row rides along with the invoice (TOK-48). `invoices.status` alone cannot
  // be trusted to say "Paid" out loud: if the two tables ever disagree, the row that
  // touched the money wins, and the family is never told about a payment that isn't there.
  const rows = await db
    .select({ invoice: invoices, paymentStatus: paymentStatuses.status })
    .from(invoices)
    .leftJoin(
      paymentStatuses,
      and(
        eq(paymentStatuses.contractId, invoices.contractId),
        eq(paymentStatuses.organizationId, session.organizationId),
      ),
    )
    .where(
      and(eq(invoices.organizationId, session.organizationId), eq(invoices.clientId, session.clientId)),
    );

  if (rows.length === 0) {
    return (
      <EmptyState
        title="Nothing due"
        body={`${doula.name} sends an invoice here once your care agreement goes out.`}
      />
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="font-heading text-2xl text-teal-ink">Pay</h2>
      {unpaid ? (
        <Alert>
          <AlertDescription>
            Payment did not go through{result ? ` (${result})` : ""}. The invoice is still due,
            and your care is not booked until it clears. Try again, or write {doula.firstName}.
          </AlertDescription>
        </Alert>
      ) : null}
      {/* A bank debit that is still clearing is not a failure and not a payment — saying
          either one would be a guess about the family's money. */}
      {!unpaid && pending ? (
        <Alert>
          <AlertDescription>
            Your payment is still clearing with your bank. Nothing more is needed from you —
            this page updates as soon as it lands, and {doula.firstName} can check on it.
          </AlertDescription>
        </Alert>
      ) : null}
      {rows.map(({ invoice, paymentStatus }) => {
        const panel = invoicePayPanel({ invoiceStatus: invoice.status, paymentStatus });
        return (
          <div key={invoice.id} className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between">
              <p className="font-medium">{invoice.number}</p>
              <Badge
                variant="secondary"
                className={
                  panel.badge.tone === "coral"
                    ? "bg-coral/12 text-coral"
                    : "bg-teal/12 text-teal-ink"
                }
              >
                {panel.badge.label}
              </Badge>
            </div>
            <p className="font-heading text-2xl text-teal-ink">
              {formatCents(invoice.amountCents, invoice.currency)}
            </p>
            {panel.body ? <p className="mt-2 text-sm text-teal">{panel.body}</p> : null}
            {panel.action === "pay" ? (
              <form action={payInvoiceAction.bind(null, invoice.id)} className="mt-3">
                <Button type="submit">Pay with card</Button>
              </form>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
