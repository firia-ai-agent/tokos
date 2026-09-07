import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { contracts } from "@/db/schema";
import { markAgreementSigned } from "@/lib/funnel";
import { DemoBanner } from "@/components/brand/shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

async function completeStubSign(formData: FormData) {
  "use server";
  const contractId = String(formData.get("contractId") ?? "");
  const db = getDb();
  const [contract] = await db.select().from(contracts).where(eq(contracts.id, contractId)).limit(1);
  if (!contract) redirect("/portal");
  await markAgreementSigned({
    organizationId: contract.organizationId,
    contractId,
  });
  redirect("/portal?signed=1");
}

export default async function StubSignPage({
  searchParams,
}: {
  searchParams: Promise<{ contractId?: string }>;
}) {
  const { contractId } = await searchParams;
  if (!contractId) redirect("/portal");
  return (
    <div className="min-h-screen">
      <DemoBanner />
      <main className="mx-auto max-w-lg px-4 py-16">
        <Card>
          <CardHeader>
            <CardTitle>Review care agreement</CardTitle>
            <CardDescription>
              Dropbox Sign stub. In production this is a redirect to Essentials. Signing is
              intent only — complete still needs fit and payment.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={completeStubSign} className="space-y-4">
              <input type="hidden" name="contractId" value={contractId} />
              <p className="text-sm leading-relaxed text-muted-foreground">
                I intend to work with this doula under the package we discussed. This is not a
                clinical consent and does not finish the contract by itself.
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
