import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { contracts } from "@/db/schema";
import { markAgreementSigned } from "@/lib/funnel";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const contractId = url.searchParams.get("contractId");
  if (!contractId) {
    return Response.redirect(new URL("/portal", request.url));
  }
  const db = getDb();
  const [contract] = await db.select().from(contracts).where(eq(contracts.id, contractId)).limit(1);
  if (contract) {
    await markAgreementSigned({
      organizationId: contract.organizationId,
      contractId,
    });
  }
  return Response.redirect(new URL("/portal?signed=1", request.url));
}
