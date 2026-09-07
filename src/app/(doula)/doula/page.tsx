import Link from "next/link";
import { requireStaff } from "@/lib/tenancy";
import { revenueHome, stageLabel } from "@/lib/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/brand/states";

export default async function DoulaHomePage() {
  const staff = await requireStaff();
  const { clients, kpis } = await revenueHome(staff.organizationId, staff.userId);

  return (
    <div className="space-y-8">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {kpi.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-heading text-2xl text-teal-ink">{kpi.value}</p>
              <p className="text-xs text-muted-foreground">{kpi.hint}</p>
            </CardContent>
          </Card>
        ))}
      </section>
      <section className="space-y-3">
        <h2 className="font-heading text-2xl text-teal-ink">My clients</h2>
        {clients.length === 0 ? (
          <EmptyState
            title="No assigned families yet"
            body="A Book Consult on your public profile creates a lead on this list."
          />
        ) : (
          <div className="grid gap-3">
            {clients.map(({ client, stage }) => (
              <Link
                key={client.id}
                href={`/doula/clients/${client.id}`}
                className="flex items-center justify-between rounded-xl border bg-card p-4"
              >
                <div>
                  <p className="font-medium">{client.displayName}</p>
                  <p className="text-sm text-muted-foreground">
                    Due {client.edd ?? "—"} · {client.city ?? "location TBD"}
                  </p>
                </div>
                <Badge variant="secondary">{stageLabel(stage)}</Badge>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
