import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { format } from "date-fns";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, contracts, esignArtifacts } from "@/db/schema";
import { resendAgreementAction } from "@/app/actions/doula";
import { contractStatusLabel } from "@/lib/client-status";
import { appUrl } from "@/lib/env";
import { familySignUrl, isLiveContract, isUnsignedContract, MONEY_COPY } from "@/lib/family-money";
import { formatCents } from "@/lib/money";
import { requireStaff } from "@/lib/tenancy";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Where "Open agreement" lands for staff (TOK-77).
 *
 * The family's signing page is a client-session page, and it has to stay one — the point
 * of an e-signature is that the person signing is the person logged in. So staff get this
 * instead: what went out, when, what it is worth, and the exact link the family holds, in
 * a form that can be pasted into a message when she says she never got the email.
 *
 * When a real provider has handed back a document URL, that URL *is* the agreement and
 * this page gets out of the way.
 */
export default async function AgreementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ contractId?: string }>;
}) {
  const { id } = await params;
  const { contractId } = await searchParams;
  const staff = await requireStaff();
  const db = getDb();

  const [client] = await db
    .select({ id: clients.id, displayName: clients.displayName, preferredName: clients.preferredName })
    .from(clients)
    .where(and(eq(clients.id, id), eq(clients.organizationId, staff.organizationId)))
    .limit(1);
  if (!client) notFound();

  // The contract is re-read against both the org and the family in the URL, so a posted
  // id cannot pull someone else's agreement onto this record.
  const [row] = await db
    .select({
      contract: contracts,
      documentUrl: esignArtifacts.documentUrl,
      provider: esignArtifacts.provider,
    })
    .from(contracts)
    .leftJoin(esignArtifacts, eq(esignArtifacts.contractId, contracts.id))
    .where(
      and(
        eq(contracts.id, String(contractId ?? "")),
        eq(contracts.organizationId, staff.organizationId),
        eq(contracts.clientId, client.id),
      ),
    )
    .limit(1);
  if (!row) notFound();

  if (row.documentUrl) redirect(row.documentUrl);

  const contract = row.contract;
  const status = contractStatusLabel(contract.status);
  const signUrl = familySignUrl({ id: contract.id, documentUrl: null }, appUrl());
  const canResend = isLiveContract(contract) && isUnsignedContract(contract);
  const back = `/doula/clients/${client.id}#money`;

  return (
    <div className="space-y-4">
      <div>
        <Link href={back} className="text-[12.5px] font-semibold text-coral hover:underline">
          ← {client.displayName}
        </Link>
        <h2 className="mt-1 font-heading text-3xl text-teal-ink">Care agreement</h2>
        <p className="text-sm text-muted-foreground">
          {contract.packageLabel} · {formatCents(contract.amountCents, contract.currency)}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Where this stands</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <dl className="grid gap-2 sm:grid-cols-2">
            <Fact label="Status" value={status.label} />
            <Fact
              label="Sent"
              value={contract.sentAt ? format(contract.sentAt, "MMMM d, yyyy") : "Not sent yet"}
            />
            <Fact
              label="Signed"
              value={contract.signedAt ? format(contract.signedAt, "MMMM d, yyyy") : "Not signed yet"}
            />
            <Fact label="Signing" value={row.provider ? "E-signature request open" : "No request on file"} />
          </dl>

          <div>
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              The family&apos;s signing link
            </p>
            {/* Deliberately text, not a link: it opens in her session, not yours. Paste it
                into a message when she says the email never arrived. */}
            <p className="mt-1 break-all rounded-lg bg-cloud px-3 py-2 font-mono text-[12px] text-teal-ink ring-1 ring-teal/15">
              {signUrl}
            </p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              It signs her in as herself — opening it from a staff account will not sign the
              agreement.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {canResend ? (
              <form action={resendAgreementAction}>
                <input type="hidden" name="contractId" value={contract.id} />
                <input type="hidden" name="clientId" value={client.id} />
                <Button type="submit" size="sm" variant="secondary">
                  {MONEY_COPY.resendAgreement}
                </Button>
              </form>
            ) : null}
            <Link
              href={back}
              className="inline-flex h-8 items-center justify-center rounded-lg border border-teal/25 bg-card px-3 text-[12.5px] font-semibold text-teal-ink transition-colors hover:bg-teal/10"
            >
              Back to the record
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </dt>
      <dd className="text-[13.5px] font-medium text-teal-ink">{value}</dd>
    </div>
  );
}
