import Link from "next/link";
import { requireStaff } from "@/lib/tenancy";
import { listOrgClients, stageLabel } from "@/lib/queries";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/brand/states";

export default async function ClientsPage() {
  const staff = await requireStaff();
  const rows = await listOrgClients(staff.organizationId, staff.userId);
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Pipeline is empty"
        body="Share your profile QR or send a Book Consult link."
      />
    );
  }
  return (
    <div className="space-y-4">
      <h2 className="font-heading text-2xl text-teal-ink">Pipeline</h2>
      <p className="text-sm text-muted-foreground">
        new lead → intro → fit → agreement signed (intent) → complete (fit + payment) → active care
      </p>
      <div className="grid gap-3">
        {rows.map(({ client, stage, fitConfirmedAt }) => (
          <Link
            key={client.id}
            href={`/doula/clients/${client.id}`}
            className="rounded-xl border bg-card p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium">{client.displayName}</p>
              <Badge>{stageLabel(stage)}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {client.email}
              {fitConfirmedAt ? " · Fit confirmed" : ""}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
