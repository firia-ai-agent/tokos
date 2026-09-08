import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { contracts } from "@/db/schema";
import { auth } from "@/auth";
import { clientOwnsRow } from "@/lib/ownership";

/**
 * Dropbox Sign redirect landing. Does not mark signed from a bare UUID GET (TOK-21).
 * Signature completion is the authenticated stub form or a verified webhook.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const contractId = url.searchParams.get("contractId");
  const login = new URL("/login", request.url);

  const session = await auth();
  const user = session?.user;
  if (!user?.id || user.actorType !== "client" || !user.clientId || !user.organizationId) {
    return Response.redirect(login);
  }
  if (!contractId) {
    return Response.redirect(new URL("/portal", request.url));
  }

  const db = getDb();
  const [contract] = await db
    .select()
    .from(contracts)
    .where(and(eq(contracts.id, contractId), eq(contracts.organizationId, user.organizationId)))
    .limit(1);

  if (!contract || !clientOwnsRow({ organizationId: user.organizationId, clientId: user.clientId }, contract)) {
    return Response.redirect(new URL("/portal", request.url));
  }

  const alreadySigned = Boolean(contract.signedAt) || contract.status === "signed";
  return Response.redirect(new URL(alreadySigned ? "/portal?signed=1" : "/portal/contract", request.url));
}
