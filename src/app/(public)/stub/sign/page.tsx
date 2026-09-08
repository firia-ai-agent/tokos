import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { contracts } from "@/db/schema";
import { markAgreementSigned } from "@/lib/funnel";
import { clientOwnsRow } from "@/lib/ownership";
import { requireClientPage } from "@/lib/tenancy";
import { resolveAssignedDoulaName } from "@/lib/assigned-doula";
import { DemoBanner } from "@/components/brand/shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

async function completeStubSign(formData: FormData) {
  "use server";
  const session = await requireClientPage();
  const contractId = String(formData.get("contractId") ?? "");
  const db = getDb();
  const [contract] = await db.select().from(contracts).where(eq(contracts.id, contractId)).limit(1);
  if (!contract || !clientOwnsRow(session, contract)) redirect("/portal");
  await markAgreementSigned({
    organizationId: session.organizationId,
    contractId,
    actorUserId: session.userId,
  });
  redirect("/portal?signed=1");
}

export default async function StubSignPage({
  searchParams,
}: {
  searchParams: Promise<{ contractId?: string }>;
}) {
  const session = await requireClientPage();
  const { contractId } = await searchParams;
  if (!contractId) redirect("/portal");
  const db = getDb();
  const [contract] = await db
    .select()
    .from(contracts)
    .where(
      and(eq(contracts.id, contractId), eq(contracts.organizationId, session.organizationId)),
    )
    .limit(1);
  if (!contract || !clientOwnsRow(session, contract)) redirect("/portal");

  const doula = await resolveAssignedDoulaName({
    organizationId: session.organizationId,
    clientId: session.clientId,
  });

  return (
    <div className="min-h-screen">
      <DemoBanner />
      <main className="mx-auto max-w-lg px-4 py-16">
        <Card>
          <CardHeader>
            <CardTitle>Review care agreement</CardTitle>
            <CardDescription>
              Dropbox Sign stub. In production this is a redirect to Essentials. Signing is
              intent only — complete still needs fit and payment. You must be signed in as this
              client.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={completeStubSign} className="space-y-4">
              <input type="hidden" name="contractId" value={contractId} />
              <p className="text-sm leading-relaxed text-muted-foreground">
                I intend to work with {doula.name} under the package we discussed. This is
                not a clinical consent and does not finish the contract by itself.
              </p>
              <Button type="submit" className="w-full">
                Sign and return to Tokos
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
