import Link from "next/link";
import { requireStaff } from "@/lib/tenancy";
import { listAgencyClients, listOrgClients, orgMatches } from "@/lib/queries";
import { stageLabel } from "@/lib/pipeline";
import {
  agencyBoardSummary,
  clientsEmpty,
  clientsHeading,
  clientsLegend,
  shellPersona,
} from "@/lib/shell-persona";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/brand/states";

export default async function ClientsPage() {
  const staff = await requireStaff();
  // TOK-34 D7: an owner/admin is looking at the practice, so the board is org-wide and
  // includes families nobody is on yet. A doula is looking at her caseload, so the list
  // stays assignment-scoped exactly as it was.
  const persona = shellPersona(staff.membershipRole);
  const [rows, matches] = await Promise.all([
    persona === "agency"
      ? listAgencyClients(staff.organizationId)
      : listOrgClients(staff.organizationId, staff.userId),
    orgMatches(staff.organizationId),
  ]);
  // Who is primary on each family, so the pipeline reads as an agency board and not just
  // a personal list. Same org scope as the client rows themselves.
  const primaryOf = new Map(matches.map((row) => [row.clientId, row.primaryDoulaName]));

  if (rows.length === 0) {
    const empty = clientsEmpty(persona);
    return <EmptyState title={empty.title} body={empty.body} />;
  }

  // Families waiting on a primary are the agency's actual queue, so they sort to the top
  // of the board. Array#sort is stable, so everyone else keeps the name order the query
  // returned. A doula's list is hers alone and is left in query order.
  const ordered =
    persona === "agency"
      ? [...rows].sort(
          (a, b) =>
            Number(Boolean(primaryOf.get(a.client.id))) -
            Number(Boolean(primaryOf.get(b.client.id))),
        )
      : rows;
  const unassigned = rows.filter((row) => !primaryOf.get(row.client.id)).length;

  return (
    <div className="space-y-4">
      <h2 className="font-heading text-2xl text-teal-ink">{clientsHeading(persona)}</h2>
      <p className="text-sm text-muted-foreground">{clientsLegend(persona)}</p>
      {persona === "agency" ? (
        <p className="text-[13px] font-medium text-teal">
          {agencyBoardSummary(rows.length, unassigned)}
        </p>
      ) : null}
      <div className="grid gap-3">
        {ordered.map(({ client, stage, fitConfirmedAt }) => {
          const primary = primaryOf.get(client.id);
          return (
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
                {" · "}
                {primary ? `Primary: ${primary}` : "No primary yet"}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
