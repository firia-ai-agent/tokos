import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  assignments,
  calendarEvents,
  clientPortalAccess,
  clients,
  contractEvents,
  contracts,
  engagements,
  esignArtifacts,
  fileObjects,
  invoiceLines,
  invoices,
  paymentStatuses,
  pipelineEvents,
  pipelineStages,
} from "@/db/schema";
import { createSignatureRequest } from "@/lib/adapters/esign";
import { createCheckoutSession } from "@/lib/adapters/stripe";
import { putObject } from "@/lib/adapters/s3";
import { writeAudit } from "@/lib/audit";
import { newId } from "@/lib/ids";
import { enqueueEmail } from "@/lib/outbox";
import {
  advanceAfterEvent,
  canTransition,
  plannedHops,
  type FunnelFlags,
  type PipelineStageName,
} from "@/lib/pipeline";
import { isPaymentCleared, paymentOutcomeStatuses, type PaymentOutcome } from "@/lib/payment";
import { assertSlotOpen } from "@/lib/calendar";
import { appUrl } from "@/lib/env";

export async function getFunnelFlags(
  organizationId: string,
  clientId: string,
): Promise<{ stage: PipelineStageName; flags: FunnelFlags; contractId?: string; invoiceId?: string }> {
  const db = getDb();
  const [pipeline] = await db
    .select()
    .from(pipelineStages)
    .where(
      and(eq(pipelineStages.organizationId, organizationId), eq(pipelineStages.clientId, clientId)),
    )
    .limit(1);
  if (!pipeline) {
    throw new Error("Pipeline missing for client");
  }

  const [contract] = await db
    .select()
    .from(contracts)
    .where(and(eq(contracts.organizationId, organizationId), eq(contracts.clientId, clientId)))
    .orderBy(desc(contracts.createdAt))
    .limit(1);

  const payment = contract
    ? (
        await db
          .select()
          .from(paymentStatuses)
          .where(eq(paymentStatuses.contractId, contract.id))
          .limit(1)
      )[0]
    : undefined;

  const invoice = contract
    ? (
        await db
          .select()
          .from(invoices)
          .where(eq(invoices.contractId, contract.id))
          .limit(1)
      )[0]
    : undefined;

  return {
    stage: pipeline.stage as PipelineStageName,
    flags: {
      fitConfirmed: Boolean(pipeline.fitConfirmedAt),
      paymentCleared: isPaymentCleared({
        paymentStatus: payment?.status,
        invoiceStatus: invoice?.status,
      }),
      agreementSigned: Boolean(contract?.signedAt) || contract?.status === "signed",
    },
    contractId: contract?.id,
    invoiceId: invoice?.id,
  };
}

async function writeStage(
  organizationId: string,
  clientId: string,
  from: PipelineStageName | null,
  to: PipelineStageName,
  actorUserId: string | null,
  reason: string,
) {
  const db = getDb();
  await db
    .update(pipelineStages)
    .set({ stage: to, enteredAt: new Date(), updatedAt: new Date() })
    .where(and(eq(pipelineStages.organizationId, organizationId), eq(pipelineStages.clientId, clientId)));
  await db.insert(pipelineEvents).values({
    id: newId(),
    organizationId,
    clientId,
    fromStage: from,
    toStage: to,
    actorUserId,
    reason,
  });
}

async function maybeAdvance(
  organizationId: string,
  clientId: string,
  actorUserId: string | null,
  reason: string,
) {
  const current = await getFunnelFlags(organizationId, clientId);
  const target = advanceAfterEvent(current.stage, current.flags);
  if (target === current.stage) return current.stage;

  // Walk each canonical hop so pay-then-sign records agreement_signed then complete (TOK-22).
  let stage = current.stage;
  for (const hop of plannedHops(stage, target)) {
    const check = canTransition(stage, hop, current.flags);
    if (!check.ok) return stage;
    await writeStage(organizationId, clientId, stage, hop, actorUserId, reason);
    stage = hop;
  }
  return stage;
}

export async function sendIntro(input: {
  organizationId: string;
  clientId: string;
  actorUserId: string;
  profileUrl: string;
}) {
  const current = await getFunnelFlags(input.organizationId, input.clientId);
  const move = canTransition(current.stage, "intro", current.flags);
  if (!move.ok) throw new Error(move.reason);
  await writeStage(input.organizationId, input.clientId, current.stage, "intro", input.actorUserId, "intro_sent");
  const db = getDb();
  const [client] = await db.select().from(clients).where(eq(clients.id, input.clientId)).limit(1);
  if (client) {
    await enqueueEmail({
      organizationId: input.organizationId,
      triggerKey: "client_welcome",
      toEmail: client.email,
      vars: {
        client_name: client.preferredName || client.displayName,
        portal_url: `${appUrl()}/login`,
        profile_url: input.profileUrl,
      },
    });
  }
  await writeAudit({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: "intro.sent",
    entityType: "client",
    entityId: input.clientId,
  });
}

export async function startFit(input: {
  organizationId: string;
  clientId: string;
  actorUserId: string;
}) {
  const current = await getFunnelFlags(input.organizationId, input.clientId);
  const move = canTransition(current.stage, "fit", current.flags);
  if (!move.ok) throw new Error(move.reason);
  await writeStage(input.organizationId, input.clientId, current.stage, "fit", input.actorUserId, "fit_started");
}

export async function confirmFit(input: {
  organizationId: string;
  clientId: string;
  actorUserId: string;
}) {
  const db = getDb();
  const current = await getFunnelFlags(input.organizationId, input.clientId);
  if (["new_lead", "intro"].includes(current.stage)) {
    throw new Error("Confirm fit only after the fit stage.");
  }
  await db
    .update(pipelineStages)
    .set({
      fitConfirmedAt: new Date(),
      fitConfirmedByUserId: input.actorUserId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(pipelineStages.organizationId, input.organizationId),
        eq(pipelineStages.clientId, input.clientId),
      ),
    );
  await writeAudit({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: "fit.confirmed",
    entityType: "client",
    entityId: input.clientId,
  });
  return maybeAdvance(input.organizationId, input.clientId, input.actorUserId, "fit_confirmed");
}

export async function sendContract(input: {
  organizationId: string;
  clientId: string;
  actorUserId: string;
  packageLabel?: string;
  amountCents?: number;
}) {
  const current = await getFunnelFlags(input.organizationId, input.clientId);
  if (["new_lead", "intro"].includes(current.stage)) {
    throw new Error("Send a contract only after fit.");
  }

  const db = getDb();
  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.organizationId, input.organizationId), eq(clients.id, input.clientId)))
    .limit(1);
  if (!client) throw new Error("Client not found");

  const [assignment] = await db
    .select()
    .from(assignments)
    .where(and(eq(assignments.clientId, input.clientId), eq(assignments.status, "active")))
    .limit(1);

  const packageLabel = input.packageLabel ?? "Birth support package";
  const amountCents = input.amountCents ?? 280000;

  const [existingEngagement] = await db
    .select()
    .from(engagements)
    .where(eq(engagements.clientId, input.clientId))
    .limit(1);

  const engagementId = existingEngagement?.id ?? newId();
  if (!existingEngagement) {
    await db.insert(engagements).values({
      id: engagementId,
      organizationId: input.organizationId,
      clientId: input.clientId,
      packageLabel,
      amountCents,
      targetDate: client.edd,
      primaryDoulaUserId: assignment?.userId,
      status: "open",
    });
  }

  const contractId = newId();
  await db.insert(contracts).values({
    id: contractId,
    organizationId: input.organizationId,
    clientId: input.clientId,
    engagementId,
    packageLabel,
    amountCents,
    status: "sent",
    sentAt: new Date(),
  });
  await db.insert(contractEvents).values({
    id: newId(),
    organizationId: input.organizationId,
    contractId,
    type: "sent",
    actorUserId: input.actorUserId,
  });
  await db.insert(paymentStatuses).values({
    id: newId(),
    organizationId: input.organizationId,
    contractId,
    method: "stripe",
    status: "due",
    amountCents,
  });

  const invoiceCount = (await db.select().from(invoices).where(eq(invoices.organizationId, input.organizationId))).length;
  const invoiceId = newId();
  const number = `NOVA-${1001 + invoiceCount}`;
  await db.insert(invoices).values({
    id: invoiceId,
    organizationId: input.organizationId,
    clientId: input.clientId,
    contractId,
    engagementId,
    number,
    status: "open",
    amountCents,
    dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
  await db.insert(invoiceLines).values({
    id: newId(),
    organizationId: input.organizationId,
    invoiceId,
    description: packageLabel,
    quantity: 1,
    unitAmountCents: amountCents,
  });

  const esign = await createSignatureRequest({
    organizationId: input.organizationId,
    contractId,
    signerName: client.displayName,
    signerEmail: client.email,
    title: `${packageLabel} — care agreement`,
  });

  await db.insert(esignArtifacts).values({
    id: newId(),
    organizationId: input.organizationId,
    contractId,
    provider: esign.provider,
    externalId: esign.externalId,
    rawStatus: esign.rawStatus,
  });

  await enqueueEmail({
    organizationId: input.organizationId,
    triggerKey: "agreement_sent",
    toEmail: client.email,
    vars: {
      client_name: client.preferredName || client.displayName,
      portal_url: `${appUrl()}/portal`,
      sign_url: esign.signUrl,
    },
  });
  await enqueueEmail({
    organizationId: input.organizationId,
    triggerKey: "invoice_due",
    toEmail: client.email,
    vars: {
      client_name: client.preferredName || client.displayName,
      portal_url: `${appUrl()}/portal/pay`,
      invoice_number: number,
    },
  });

  await writeAudit({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: "contract.sent",
    entityType: "contract",
    entityId: contractId,
  });

  return { contractId, invoiceId, signUrl: esign.signUrl };
}

export async function markAgreementSigned(input: {
  organizationId: string;
  contractId: string;
  actorUserId?: string | null;
}) {
  const db = getDb();
  const [contract] = await db
    .select()
    .from(contracts)
    .where(
      and(eq(contracts.id, input.contractId), eq(contracts.organizationId, input.organizationId)),
    )
    .limit(1);
  if (!contract) throw new Error("Contract not found");

  const current = await getFunnelFlags(input.organizationId, contract.clientId);
  if (!["fit", "agreement_signed", "contract_complete", "active_care"].includes(current.stage)) {
    throw new Error("Cannot sign before fit.");
  }

  await db
    .update(contracts)
    .set({ status: "signed", signedAt: new Date(), updatedAt: new Date() })
    .where(eq(contracts.id, contract.id));
  await db.insert(contractEvents).values({
    id: newId(),
    organizationId: input.organizationId,
    contractId: contract.id,
    type: "signed",
    actorUserId: input.actorUserId,
  });
  await db
    .update(esignArtifacts)
    .set({ rawStatus: "signed", signedAt: new Date(), updatedAt: new Date() })
    .where(eq(esignArtifacts.contractId, contract.id));

  const evidence = await putObject({
    organizationId: input.organizationId,
    key: `contracts/${input.organizationId}/${contract.id}.txt`,
    body: `Signed care agreement ${contract.id} at ${new Date().toISOString()}`,
    contentType: "text/plain",
  });
  const fileId = newId();
  await db.insert(fileObjects).values({
    id: fileId,
    organizationId: input.organizationId,
    bucket: evidence.bucket,
    objectKey: evidence.key,
    contentType: "text/plain",
    purpose: "signed_contract",
  });

  await writeAudit({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: "contract.signed",
    entityType: "contract",
    entityId: contract.id,
  });

  return maybeAdvance(input.organizationId, contract.clientId, input.actorUserId ?? null, "agreement_signed");
}

export async function markInvoicePaid(input: {
  organizationId: string;
  invoiceId: string;
  externalId?: string;
  actorUserId?: string | null;
}) {
  const db = getDb();
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, input.invoiceId), eq(invoices.organizationId, input.organizationId)))
    .limit(1);
  if (!invoice) throw new Error("Invoice not found");

  await db
    .update(invoices)
    .set({
      status: "paid",
      paidAt: new Date(),
      stripeCheckoutSessionId: input.externalId,
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, invoice.id));

  if (invoice.contractId) {
    await db
      .update(paymentStatuses)
      .set({
        status: "cleared",
        method: input.externalId?.startsWith("stub") ? "manual" : "stripe",
        externalId: input.externalId,
        clearedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(paymentStatuses.contractId, invoice.contractId));
  }

  await writeAudit({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: "invoice.paid",
    entityType: "invoice",
    entityId: invoice.id,
  });

  return maybeAdvance(input.organizationId, invoice.clientId, input.actorUserId ?? null, "payment_cleared");
}

/** Stub/demo fail path: never marks invoice paid or payment cleared (TOK-17). */
export async function recordPaymentFailure(input: {
  organizationId: string;
  invoiceId: string;
  outcome: Extract<PaymentOutcome, "failed" | "canceled">;
  actorUserId?: string | null;
  externalId?: string;
}) {
  const db = getDb();
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, input.invoiceId), eq(invoices.organizationId, input.organizationId)))
    .limit(1);
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status === "paid") {
    throw new Error("Invoice already paid");
  }

  const statuses = paymentOutcomeStatuses(input.outcome);
  if (invoice.contractId) {
    await db
      .update(paymentStatuses)
      .set({
        status: statuses.paymentStatus,
        method: "manual",
        externalId: input.externalId,
        clearedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(paymentStatuses.contractId, invoice.contractId));
  }

  await writeAudit({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: `invoice.payment_${input.outcome}`,
    entityType: "invoice",
    entityId: invoice.id,
  });

  return maybeAdvance(input.organizationId, invoice.clientId, input.actorUserId ?? null, `payment_${input.outcome}`);
}

export async function startActiveCare(input: {
  organizationId: string;
  clientId: string;
  actorUserId: string;
}) {
  const current = await getFunnelFlags(input.organizationId, input.clientId);
  const move = canTransition(current.stage, "active_care", current.flags);
  if (!move.ok) throw new Error(move.reason);
  await writeStage(
    input.organizationId,
    input.clientId,
    current.stage,
    "active_care",
    input.actorUserId,
    "care_started",
  );
}

export async function beginCheckout(input: {
  organizationId: string;
  invoiceId: string;
  customerEmail: string;
}) {
  const db = getDb();
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, input.invoiceId), eq(invoices.organizationId, input.organizationId)))
    .limit(1);
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status === "paid") throw new Error("Invoice already paid");

  const checkout = await createCheckoutSession({
    organizationId: input.organizationId,
    invoiceId: invoice.id,
    amountCents: invoice.amountCents,
    currency: invoice.currency,
    customerEmail: input.customerEmail,
    description: `Invoice ${invoice.number}`,
  });
  await db
    .update(invoices)
    .set({ stripeCheckoutSessionId: checkout.externalId, updatedAt: new Date() })
    .where(eq(invoices.id, invoice.id));
  return checkout;
}

export async function bookConsult(input: {
  organizationId: string;
  assigneeUserId: string;
  clientId: string;
  startsAt: Date;
  endsAt: Date;
  actorUserId?: string | null;
}) {
  // The Tokos calendar is the system of record, so the requested time is re-derived
  // from availability + booked events here — never trusted from the posted form.
  await assertSlotOpen({
    organizationId: input.organizationId,
    userId: input.assigneeUserId,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
  });

  const db = getDb();
  const eventId = newId();
  await db.insert(calendarEvents).values({
    id: eventId,
    organizationId: input.organizationId,
    clientId: input.clientId,
    assigneeUserId: input.assigneeUserId,
    type: "consult",
    title: "Fit consult",
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    status: "scheduled",
    locationLabel: "Video or home visit — confirm in messages",
  });

  const current = await getFunnelFlags(input.organizationId, input.clientId);
  if (current.stage === "intro") {
    const move = canTransition("intro", "fit", current.flags);
    if (move.ok) {
      await writeStage(
        input.organizationId,
        input.clientId,
        "intro",
        "fit",
        input.actorUserId ?? null,
        "consult_booked",
      );
    }
  }
  return eventId;
}

export async function createLeadFromBooking(input: {
  organizationId: string;
  assigneeUserId: string;
  name: string;
  email: string;
  phone?: string;
  edd?: string;
  startsAt: Date;
  endsAt: Date;
}) {
  // Check the slot before any row is written, so a stale or forged time never
  // leaves an orphan lead behind.
  await assertSlotOpen({
    organizationId: input.organizationId,
    userId: input.assigneeUserId,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
  });

  const db = getDb();
  const clientId = newId();
  const email = input.email.trim().toLowerCase();
  await db.insert(clients).values({
    id: clientId,
    organizationId: input.organizationId,
    displayName: input.name,
    email,
    phone: input.phone,
    source: "web",
    edd: input.edd,
  });
  await db.insert(pipelineStages).values({
    id: newId(),
    organizationId: input.organizationId,
    clientId,
    stage: "new_lead",
  });
  await db.insert(pipelineEvents).values({
    id: newId(),
    organizationId: input.organizationId,
    clientId,
    fromStage: null,
    toStage: "new_lead",
    reason: "public_book_consult",
  });
  await db.insert(assignments).values({
    id: newId(),
    organizationId: input.organizationId,
    clientId,
    userId: input.assigneeUserId,
    role: "primary",
    status: "active",
  });

  await db.insert(clientPortalAccess).values({
    id: newId(),
    organizationId: input.organizationId,
    clientId,
    email,
    status: "invited",
    inviteToken: newId(),
    inviteSentAt: new Date(),
  });

  await writeStage(input.organizationId, clientId, "new_lead", "intro", null, "book_consult_intro");
  await writeStage(input.organizationId, clientId, "intro", "fit", null, "book_consult_fit");
  await bookConsult({
    organizationId: input.organizationId,
    assigneeUserId: input.assigneeUserId,
    clientId,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
  });

  await enqueueEmail({
    organizationId: input.organizationId,
    triggerKey: "client_portal_invite",
    toEmail: email,
    vars: {
      client_name: input.name,
      portal_url: `${appUrl()}/login`,
    },
  });

  return clientId;
}

/** Free a booked window back into availability (TOK-26). */
export async function cancelCalendarEvent(input: {
  organizationId: string;
  eventId: string;
  actorUserId: string;
}) {
  const db = getDb();
  const [event] = await db
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.id, input.eventId),
        eq(calendarEvents.organizationId, input.organizationId),
        eq(calendarEvents.assigneeUserId, input.actorUserId),
      ),
    )
    .limit(1);
  if (!event) throw new Error("Forbidden");

  await db
    .update(calendarEvents)
    .set({ status: "canceled", updatedAt: new Date() })
    .where(eq(calendarEvents.id, event.id));

  await writeAudit({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: "consult.canceled",
    entityType: "calendar_event",
    entityId: event.id,
  });
}
