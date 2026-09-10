import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { invoices } from "@/db/schema";
import { requireStaff } from "@/lib/tenancy";
import { formatCents } from "@/lib/money";
import { isPaymentCleared } from "@/lib/payment";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/brand/states";

export default async function InvoicesPage() {
  const staff = await requireStaff();
  const db = getDb();
  const rows = await db
    .select()
    .from(invoices)
    .where(eq(invoices.organizationId, staff.organizationId));

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No invoices"
        body="Sending a contract creates an open invoice from the package amount."
      />
    );
  }

  const open = rows.filter((row) => row.status === "open").reduce((sum, row) => sum + row.amountCents, 0);
  // Staff keep the raw codes below, but the money line is money: only cleared invoices
  // count toward Paid, so a refunded or failed one never inflates the total (TOK-48).
  const paid = rows
    .filter((row) => isPaymentCleared({ invoiceStatus: row.status }))
    .reduce((sum, row) => sum + row.amountCents, 0);

  return (
    <div className="space-y-4">
      <h2 className="font-heading text-2xl text-teal-ink">Invoices</h2>
      <p className="text-sm text-muted-foreground">
        Open {formatCents(open)} · Paid {formatCents(paid)}
      </p>
      <div className="space-y-2">
        {rows.map((invoice) => (
          <div key={invoice.id} className="flex items-center justify-between rounded-xl border bg-card p-4">
            <div>
              <p className="font-medium">{invoice.number}</p>
              <p className="text-sm text-muted-foreground">{formatCents(invoice.amountCents)}</p>
            </div>
            <Badge variant={isPaymentCleared({ invoiceStatus: invoice.status }) ? "default" : "secondary"}>
              {invoice.status}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
