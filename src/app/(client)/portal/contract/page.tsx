import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { contracts } from "@/db/schema";
import { requireClient } from "@/lib/tenancy";
import { resolveAssignedDoulaName } from "@/lib/assigned-doula";
import { signContractAction } from "@/app/actions/client";
import { formatCents } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/brand/states";
import { Badge } from "@/components/ui/badge";

export default async function ContractPage() {
  const session = await requireClient();
  const doula = await resolveAssignedDoulaName({
    organizationId: session.organizationId,
    clientId: session.clientId,
  });
  const db = getDb();
  const rows = await db
    .select()
    .from(contracts)
    .where(
      and(eq(contracts.organizationId, session.organizationId), eq(contracts.clientId, session.clientId)),
    )
    .orderBy(desc(contracts.createdAt));

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No agreement yet"
        body={`After a fit consult, ${doula.name} sends a care agreement here.`}
      />
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="font-heading text-2xl text-teal-ink">Care agreement</h2>
      <p className="text-sm text-muted-foreground">
        A signature is intent. The contract is complete only when fit is confirmed and payment
        clears.
      </p>
      {rows.map((contract) => (
        <div key={contract.id} className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between">
            <p className="font-medium">{contract.packageLabel}</p>
            <Badge>{contract.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{formatCents(contract.amountCents)}</p>
          {contract.status === "sent" ? (
            <form action={signContractAction.bind(null, contract.id)} className="mt-3">
              <Button type="submit">Review and sign</Button>
            </form>
          ) : null}
        </div>
      ))}
    </div>
  );
}
