import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { esignArtifacts } from "@/db/schema";
import { markAgreementSigned } from "@/lib/funnel";

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  let payload: Record<string, unknown> = {};
  if (contentType.includes("json")) {
    payload = (await request.json()) as Record<string, unknown>;
  } else {
    const form = await request.formData();
    const raw = form.get("json");
    if (typeof raw === "string") payload = JSON.parse(raw) as Record<string, unknown>;
  }

  const event = payload.event as { event_type?: string } | undefined;
  const signatureRequest = payload.signature_request as
    | { signature_request_id?: string; metadata?: { contract_id?: string } }
    | undefined;

  if (event?.event_type === "signature_request_all_signed") {
    const externalId = signatureRequest?.signature_request_id;
    const db = getDb();
    const [artifact] = externalId
      ? await db
          .select()
          .from(esignArtifacts)
          .where(eq(esignArtifacts.externalId, externalId))
          .limit(1)
      : [];
    const contractId = artifact?.contractId ?? signatureRequest?.metadata?.contract_id;
    if (artifact && contractId) {
      await markAgreementSigned({
        organizationId: artifact.organizationId,
        contractId,
      });
    }
  }

  return new Response("Hello API Event Received", { status: 200 });
}
