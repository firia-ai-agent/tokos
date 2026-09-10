"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
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
import { readAnswers } from "@/lib/forms";
import { beginCheckout, bookConsult, markAgreementSigned } from "@/lib/funnel";
import { newId } from "@/lib/ids";
import { isPaymentCleared } from "@/lib/payment";
import { clientAgreementStatuses } from "@/lib/queries";
import { resourcesUnlocked } from "@/lib/resource-gate";
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
  // A settled invoice has no Pay button, so reaching here means a stale tab or a
  // hand-rolled POST. Opening Checkout anyway would charge a family twice (TOK-48).
  if (isPaymentCleared({ invoiceStatus: invoice.status })) redirect("/portal/pay");
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
  // The reply has to land on both sides of the thread: the family's own view, the Home
  // checklist that counts it, and the doula inbox / client record that answers it.
  revalidatePath("/portal");
  revalidatePath("/portal/messages");
  revalidatePath("/doula/messages");
  revalidatePath(`/doula/clients/${session.clientId}`);
}

/**
 * Opening `/portal/messages` is what marks the doula's notes read. Scoped to the session's
 * own org **and** client, and only touching rows that are still unread, so this can never
 * clear another tenant's thread or rewrite a stamp that already exists.
 */
export async function markPortalMessagesReadAction() {
  const session = await requireClient();
  const db = getDb();
  await db
    .update(portalMessages)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(portalMessages.organizationId, session.organizationId),
        eq(portalMessages.clientId, session.clientId),
        eq(portalMessages.direction, "outbound"),
        isNull(portalMessages.readAt),
      ),
    );
  // Home reads the same counter, so it has to drop with the thread.
  revalidatePath("/portal");
  revalidatePath("/portal/messages");
  revalidatePath(`/doula/clients/${session.clientId}`);
}

export async function completeFormAction(formData: FormData) {
  const session = await requireClient();
  const assignmentId = String(formData.get("assignmentId") ?? "");
  if (!assignmentId) return;
  const db = getDb();
  const [assignment] = await db
    .select()
    .from(formAssignments)
    .where(
      and(
        eq(formAssignments.id, assignmentId),
        eq(formAssignments.organizationId, session.organizationId),
        eq(formAssignments.clientId, session.clientId),
      ),
    )
    .limit(1);
  if (!assignment) return;
  const answers = readAnswers(formData.entries());
  await db.insert(formSubmissions).values({
    id: newId(),
    organizationId: session.organizationId,
    assignmentId: assignment.id,
    submittedByUserId: session.userId,
    answersJson: answers,
  });
  await db
    .update(formAssignments)
    .set({ status: "complete", updatedAt: new Date() })
    .where(eq(formAssignments.id, assignment.id));
  revalidatePath("/portal");
  revalidatePath("/portal/forms");
  revalidatePath("/doula/forms");
  revalidatePath(`/doula/clients/${assignment.clientId}`);
}

export async function markResourceDoneAction(shareId: string) {
  const session = await requireClient();
  // A page-level gate does not extend to the action behind it. Re-check the same
  // predicate here so a stale tab or a hand-rolled POST cannot mark a locked handout
  // read (TOK-39 E2). The org/client scoping on the update below still stands alone.
  const gate = await clientAgreementStatuses(session.organizationId, session.clientId);
  if (!resourcesUnlocked(gate)) return;
  const db = getDb();
  await db
    .update(resourceShares)
    .set({ completedAt: new Date() })
    .where(
      and(
        eq(resourceShares.id, shareId),
        eq(resourceShares.organizationId, session.organizationId),
        eq(resourceShares.clientId, session.clientId),
      ),
    );
  revalidatePath("/portal");
  revalidatePath("/portal/resources");
  revalidatePath("/doula/resources");
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
  // A cleared field should read back as empty, not as the string "null" — and `edd` is a
  // date column, so an empty input has to become NULL rather than "".
  const text = (name: string) => String(formData.get(name) ?? "").trim();
  const edd = text("edd");
  await db
    .update(clients)
    .set({
      preferredName: text("preferredName"),
      phone: text("phone"),
      edd: edd === "" ? null : edd,
      addressLine1: text("addressLine1"),
      addressLine2: text("addressLine2"),
      city: text("city"),
      region: text("region"),
      postalCode: text("postalCode"),
      alternateContactName: text("alternateContactName"),
      alternateContactPhone: text("alternateContactPhone"),
      updatedAt: new Date(),
    })
    .where(
      and(eq(clients.id, session.clientId), eq(clients.organizationId, session.organizationId)),
    );
  revalidatePath("/portal/profile");
  // The doula record prints the same name/EDD.
  revalidatePath(`/doula/clients/${session.clientId}`);
  redirect("/portal/profile?saved=1");
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
