"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  clients,
  contracts,
  esignArtifacts,
  formAssignments,
  formSubmissions,
  invoices,
  portalMessages,
  resourceShares,
} from "@/db/schema";
import { SlotUnavailableError, type SlotRejection } from "@/lib/calendar";
import { beginCheckout, bookConsult, markAgreementSigned } from "@/lib/funnel";
import { newId } from "@/lib/ids";
import { requireClient } from "@/lib/tenancy";

export async function signContractAction(contractId: string) {
  const session = await requireClient();
  const db = getDb();
  const [artifact] = await db
    .select()
    .from(esignArtifacts)
    .where(eq(esignArtifacts.contractId, contractId))
    .limit(1);
  if (artifact?.provider === "stub") {
    redirect(`/stub/sign?contractId=${contractId}`);
  }
  if (artifact?.documentUrl) {
    redirect(artifact.documentUrl);
  }
  redirect(`/stub/sign?contractId=${contractId}`);
}

export async function payInvoiceAction(invoiceId: string) {
  const session = await requireClient();
  const db = getDb();
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.id, invoiceId),
        eq(invoices.organizationId, session.organizationId),
        eq(invoices.clientId, session.clientId),
      ),
    )
    .limit(1);
  if (!invoice) throw new Error("Forbidden");
  const checkout = await beginCheckout({
    organizationId: session.organizationId,
    invoiceId,
    customerEmail: session.email,
  });
  redirect(checkout.url);
}

export async function sendPortalMessageAction(formData: FormData) {
  const session = await requireClient();
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;
  const db = getDb();
  await db.insert(portalMessages).values({
    id: newId(),
    organizationId: session.organizationId,
    clientId: session.clientId,
    fromUserId: session.userId,
    direction: "inbound",
    body,
  });
  revalidatePath("/portal");
}

export async function completeFormAction(formData: FormData) {
  const session = await requireClient();
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const db = getDb();
  const [assignment] = await db
    .select()
    .from(formAssignments)
    .where(
      and(
        eq(formAssignments.id, assignmentId),
        eq(formAssignments.clientId, session.clientId),
      ),
    )
    .limit(1);
  if (!assignment) return;
  const answers: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("field-")) answers[key.replace("field-", "")] = String(value);
  }
  await db.insert(formSubmissions).values({
    id: newId(),
    organizationId: session.organizationId,
    assignmentId,
    submittedByUserId: session.userId,
    answersJson: answers,
  });
  await db
    .update(formAssignments)
    .set({ status: "complete", updatedAt: new Date() })
    .where(eq(formAssignments.id, assignmentId));
  revalidatePath("/portal");
}

export async function markResourceDoneAction(shareId: string) {
  const session = await requireClient();
  const db = getDb();
  await db
    .update(resourceShares)
    .set({ completedAt: new Date() })
    .where(
      and(eq(resourceShares.id, shareId), eq(resourceShares.clientId, session.clientId)),
    );
  revalidatePath("/portal");
}

export async function bookClientConsultAction(formData: FormData) {
  const session = await requireClient();
  const assigneeUserId = String(formData.get("assigneeUserId") ?? "");
  const slot = String(formData.get("slot") ?? "");
  const [startRaw, endRaw] = slot.split("|");
  const startsAt = new Date(startRaw ?? "");
  const endsAt = new Date(endRaw ?? "");
  // bookConsult re-checks the window against the Tokos calendar. A rejection is a
  // race or a stale page, not a bug — send the client back with the reason.
  let rejection: SlotRejection | null = null;
  try {
    await bookConsult({
      organizationId: session.organizationId,
      assigneeUserId,
      clientId: session.clientId,
      startsAt,
      endsAt,
      actorUserId: session.userId,
    });
  } catch (error) {
    if (!(error instanceof SlotUnavailableError)) throw error;
    rejection = error.reason;
  }
  // redirect() throws, so it has to run outside the try block above.
  if (rejection) redirect(`/portal/calendar?error=${rejection}`);
  revalidatePath("/portal");
  revalidatePath("/doula");
}

export async function updateClientProfileAction(formData: FormData) {
  const session = await requireClient();
  const db = getDb();
  await db
    .update(clients)
    .set({
      preferredName: String(formData.get("preferredName") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      addressLine1: String(formData.get("addressLine1") ?? ""),
      city: String(formData.get("city") ?? ""),
      region: String(formData.get("region") ?? ""),
      postalCode: String(formData.get("postalCode") ?? ""),
      alternateContactName: String(formData.get("alternateContactName") ?? ""),
      alternateContactPhone: String(formData.get("alternateContactPhone") ?? ""),
      updatedAt: new Date(),
    })
    .where(eq(clients.id, session.clientId));
  revalidatePath("/portal/profile");
}

export async function finalizeStubSign(contractId: string) {
  const session = await requireClient();
  const db = getDb();
  const [row] = await db.select().from(contracts).where(eq(contracts.id, contractId)).limit(1);
  if (!row || row.organizationId !== session.organizationId || row.clientId !== session.clientId) {
    throw new Error("Forbidden");
  }
  await markAgreementSigned({
    organizationId: session.organizationId,
    contractId,
    actorUserId: session.userId,
  });
}
