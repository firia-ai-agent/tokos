import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  assignments,
  calendarEvents,
  clientAiNotes,
  clientPortalAccess,
  clients,
  contractEvents,
  contracts,
  engagements,
  esignArtifacts,
  fileObjects,
  invoiceLines,
  invoices,
  organizations,
  paymentStatuses,
  pipelineEvents,
  pipelineStages,
  users,
} from "@/db/schema";
import { createSignatureRequest } from "@/lib/adapters/esign";
import { createCheckoutSession } from "@/lib/adapters/stripe";
import { putObject } from "@/lib/adapters/s3";
import { writeAudit } from "@/lib/audit";
import { newId } from "@/lib/ids";
import { enqueueEmail } from "@/lib/outbox";
import {
  advanceAfterEvent,
  canEnterAgreementSigned,
  canSendContract,
  canTransition,
  funnelFlagsFrom,
  isStage,
  migrateStage,
  plannedHops,
  type FunnelFlags,
  type PipelineStageName,
} from "@/lib/pipeline";
import { AI_NOTE_SOURCES, type AiNoteSource } from "@/lib/lead-fields";
import { resolvePrimaryAssignedUserId } from "@/lib/assigned-doula";
import { paymentOutcomeStatuses, type PaymentOutcome } from "@/lib/payment";
import { openPaymentStatus, setPaymentStatusForInvoice } from "@/lib/payment-status";
import { dueDateFrom, invoiceNumberPrefix, nextInvoiceNumber } from "@/lib/invoice-dashboard";
import { assertSlotOpen } from "@/lib/calendar";
import { appUrl } from "@/lib/env";

export async function getFunnelFlags(
  organizationId: string,
  clientId: string,
): Promise<{
  stage: PipelineStageName;
  enteredAt: Date;
  flags: FunnelFlags;
  contractId?: string;
  invoiceId?: string;
}> {
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

  const [client] = await db
    .select({ consultDate: clients.consultDate })
    .from(clients)
    .where(and(eq(clients.organizationId, organizationId), eq(clients.id, clientId)))
    .limit(1);

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
    // Rows written before TOK-49 still say `intro`/`fit`/`contract_complete`; they are
    // read as their canonical stage here so every rule downstream sees one vocabulary.
    stage: migrateStage(pipeline.stage, { fitConfirmed: Boolean(pipeline.fitConfirmedAt) }),
    enteredAt: pipeline.enteredAt,
    // The reduction is `funnelFlagsFrom` (TOK-72), shared with the board's bulk read, so
    // a move the kanban offers is a move this function would also allow.
    flags: funnelFlagsFrom({
      fitConfirmedAt: pipeline.fitConfirmedAt,
      consultDate: client?.consultDate,
      contract,
      payment,
      invoice,
    }),
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
  const move = canTransition(current.stage, "outreach_sent", current.flags);
  if (!move.ok) throw new Error(move.reason);
  await writeStage(
    input.organizationId,
    input.clientId,
    current.stage,
    "outreach_sent",
    input.actorUserId,
    "outreach_sent",
  );
  const db = getDb();
  const [client] = await db.select().from(clients).where(eq(clients.id, input.clientId)).limit(1);
  if (client) {
    // The welcome names whoever sent it, so the first email a family gets reads the same
    // as the portal they are about to open (TOK-38 B11). The actor is already known to be
    // staff in this org, so this is a name lookup, not a trust decision.
    const [sender] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, input.actorUserId))
      .limit(1);
    await enqueueEmail({
      organizationId: input.organizationId,
      triggerKey: "client_welcome",
      toEmail: client.email,
      vars: {
        client_name: client.preferredName || client.displayName,
        portal_url: `${appUrl()}/login`,
        profile_url: input.profileUrl,
        doula_name: sender?.name ?? "",
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

export async function confirmFit(input: {
  organizationId: string;
  clientId: string;
  actorUserId: string;
}) {
  const db = getDb();
  const current = await getFunnelFlags(input.organizationId, input.clientId);
  if (!canSendContract(current.stage)) {
    throw new Error("Confirm fit only once a consult is on the record.");
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
  // Confirming the fit *is* the stage now, so the flag and the chip cannot disagree.
  if (!canEnterAgreementSigned(current.stage)) {
    await writeStage(
      input.organizationId,
      input.clientId,
      current.stage,
      "fit_confirmed",
      input.actorUserId,
      "fit_confirmed",
    );
  }
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
  if (!canSendContract(current.stage)) {
    throw new Error("Send a contract only once a consult is on the record.");
  }

  const db = getDb();
  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.organizationId, input.organizationId), eq(clients.id, input.clientId)))
    .limit(1);
  if (!client) throw new Error("Client not found");

  // Whose face the family sees follows from this row: the engagement's primary outranks
  // the assignment in `pickAssignedDoula`, so writing the wrong one here re-points her
  // portal, her thread header and her care card at somebody she has never met (TOK-67).
  // It used to be an unordered `limit(1)` over every active assignment, org-unscoped —
  // a family with a primary and a backup got whichever row Postgres felt like returning.
  const primaryDoulaUserId = await resolvePrimaryAssignedUserId({
    organizationId: input.organizationId,
    clientId: input.clientId,
  });

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
      primaryDoulaUserId,
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
  const issued = await db
    .select({ number: invoices.number })
    .from(invoices)
    .where(eq(invoices.organizationId, input.organizationId));
  const [org] = await db
    .select({ name: organizations.name, portalName: organizations.portalName, slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, input.organizationId))
    .limit(1);
  const invoiceId = newId();
  // Numbering and payment terms are the practice's, declared once beside the Templates
  // tab that shows them (TOK-55) — not two literals that drift apart in two files. The
  // sequence carries on from the highest number issued, so it never rewinds (TOK-62).
  const number = nextInvoiceNumber(
    issued.map((row) => row.number),
    invoiceNumberPrefix(org ?? null),
  );
  await db.insert(invoices).values({
    id: invoiceId,
    organizationId: input.organizationId,
    clientId: input.clientId,
    contractId,
    engagementId,
    number,
    status: "open",
    amountCents,
    dueAt: dueDateFrom(new Date()),
  });
  await db.insert(invoiceLines).values({
    id: newId(),
    organizationId: input.organizationId,
    invoiceId,
    description: packageLabel,
    quantity: 1,
    unitAmountCents: amountCents,
  });
  // Opened after the invoice rather than after the contract, so the row is anchored to
  // the bill it tracks — the same call the hand-invoice path makes (TOK-61).
  await openPaymentStatus({
    organizationId: input.organizationId,
    invoiceId,
    contractId,
    amountCents,
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
  if (!canEnterAgreementSigned(current.stage)) {
    throw new Error("Cannot sign before fit is confirmed.");
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
  /**
   * How the money arrived. `manual` is a payment taken outside Tokos — a cheque, a
   * transfer, cash at a visit — recorded by staff who received it (TOK-55). It clears the
   * invoice exactly as a card does, because the money is equally real; what it must not
   * do is overwrite the Checkout session on an invoice Stripe is still working on.
   */
  method?: "stripe" | "manual";
}) {
  const db = getDb();
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, input.invoiceId), eq(invoices.organizationId, input.organizationId)))
    .limit(1);
  if (!invoice) throw new Error("Invoice not found");

  const method = input.method ?? (input.externalId?.startsWith("stub") ? "manual" : "stripe");

  await db
    .update(invoices)
    .set({
      status: "paid",
      paidAt: new Date(),
      // A hand-recorded payment has no Checkout session, and its reference is not one.
      ...(method === "stripe" ? { stripeCheckoutSessionId: input.externalId } : {}),
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, invoice.id));

  // Every invoice has a payment row to clear now, contract-backed or hand-raised (TOK-61).
  await setPaymentStatusForInvoice({
    organizationId: input.organizationId,
    invoice,
    status: "cleared",
    method,
    externalId: input.externalId,
    clearedAt: new Date(),
  });

  await writeAudit({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: "invoice.paid",
    entityType: "invoice",
    entityId: invoice.id,
    metadata: { method },
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
  // A declined card on a hand-raised invoice used to land nowhere at all, so the family
  // was shown "due" for a payment she had already watched fail (TOK-61).
  await setPaymentStatusForInvoice({
    organizationId: input.organizationId,
    invoice,
    status: statuses.paymentStatus,
    method: "manual",
    externalId: input.externalId,
    clearedAt: null,
  });

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

  // The consult date is a lead field now (TOK-49), and `consult_scheduled` is gated on
  // it, so the booking writes the date before it asks for the stage.
  const consultDate = input.startsAt.toISOString().slice(0, 10);
  await db
    .update(clients)
    .set({ consultDate, updatedAt: new Date() })
    .where(and(eq(clients.organizationId, input.organizationId), eq(clients.id, input.clientId)));

  const current = await getFunnelFlags(input.organizationId, input.clientId);
  const move = canTransition(current.stage, "consult_scheduled", {
    ...current.flags,
    consultDateSet: true,
  });
  if (move.ok && !move.requiresConfirm) {
    await writeStage(
      input.organizationId,
      input.clientId,
      current.stage,
      "consult_scheduled",
      input.actorUserId ?? null,
      "consult_booked",
    );
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
    source: "website",
    edd: input.edd,
    // A booking is contact: the board should not show this lead as never touched.
    lastContactAt: new Date(),
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

  await writeStage(
    input.organizationId,
    clientId,
    "new_lead",
    "outreach_sent",
    null,
    "book_consult_outreach",
  );
  // `bookConsult` writes the consult date and then moves the stage to consult_scheduled.
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

/* ------------------------------------------------------------ TOK-49 CRM writes ---- */

/**
 * Move a record to any stage the rules allow (TOK-49).
 *
 * This is the dropdown's write path and it replaces the one-way advance buttons. A
 * backward move is legal here — `canTransition` says so — but it only goes through when
 * the caller has confirmed it, so a mis-click on a `<select>` cannot silently un-complete
 * a signed, paid family.
 *
 * The rules live in `@/lib/pipeline` and are re-checked here rather than trusted from the
 * page: a server action is reachable by direct POST.
 */
export async function setPipelineStage(input: {
  organizationId: string;
  clientId: string;
  actorUserId: string;
  to: string;
  /** The UI's "yes, move it back" acknowledgement. */
  confirmed?: boolean;
}): Promise<{ ok: true; stage: PipelineStageName } | { ok: false; reason: string }> {
  if (!isStage(input.to)) return { ok: false, reason: "Unknown stage." };
  const to = input.to;

  const current = await getFunnelFlags(input.organizationId, input.clientId);
  const move = canTransition(current.stage, to, current.flags);
  if (!move.ok) return { ok: false, reason: move.reason };
  if (move.requiresConfirm && !input.confirmed) {
    return {
      ok: false,
      reason: `Moving back to ${to} needs a confirmation.`,
    };
  }

  const db = getDb();

  // Entering fit_confirmed by hand is still confirming the fit, and stepping back below
  // it withdraws that claim — otherwise the complete rule would keep passing on a match
  // the board says is no longer made.
  if (to === "fit_confirmed" && !current.flags.fitConfirmed) {
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
  } else if (move.requiresConfirm && !canEnterAgreementSigned(to) && current.flags.fitConfirmed) {
    await db
      .update(pipelineStages)
      .set({ fitConfirmedAt: null, fitConfirmedByUserId: null, updatedAt: new Date() })
      .where(
        and(
          eq(pipelineStages.organizationId, input.organizationId),
          eq(pipelineStages.clientId, input.clientId),
        ),
      );
  }

  await writeStage(
    input.organizationId,
    input.clientId,
    current.stage,
    to,
    input.actorUserId,
    move.requiresConfirm ? "stage_set_backward" : "stage_set",
  );

  await writeAudit({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: move.requiresConfirm ? "pipeline.stage_reverted" : "pipeline.stage_set",
    entityType: "client",
    entityId: input.clientId,
    metadata: { from: current.stage, to },
  });

  return { ok: true, stage: to };
}

/**
 * Append one dated line to a lead's notes feed. Append-only: a correction is another
 * note, so the record still shows what was believed and when.
 */
export async function appendClientNote(input: {
  organizationId: string;
  clientId: string;
  body: string;
  source?: AiNoteSource;
  actorUserId?: string | null;
  at?: Date;
}) {
  const body = input.body.trim();
  if (!body) return null;
  const source = AI_NOTE_SOURCES.includes(input.source ?? "staff")
    ? (input.source ?? "staff")
    : "staff";
  const db = getDb();
  const id = newId();
  await db.insert(clientAiNotes).values({
    id,
    organizationId: input.organizationId,
    clientId: input.clientId,
    body,
    source,
    actorUserId: input.actorUserId ?? null,
    at: input.at ?? new Date(),
  });
  return id;
}

/**
 * Two-tap contact log (TOK-49). Last Contact is the field a doula will actually keep
 * current only if keeping it current is one tap, so the note is optional and the stamp
 * is the point. Portal messages call this too, which is why `at` is a parameter.
 */
export async function logClientContact(input: {
  organizationId: string;
  clientId: string;
  actorUserId?: string | null;
  note?: string;
  source?: AiNoteSource;
  at?: Date;
}) {
  const at = input.at ?? new Date();
  const db = getDb();
  await db
    .update(clients)
    .set({ lastContactAt: at, updatedAt: new Date() })
    .where(and(eq(clients.organizationId, input.organizationId), eq(clients.id, input.clientId)));
  if (input.note?.trim()) {
    await appendClientNote({
      organizationId: input.organizationId,
      clientId: input.clientId,
      body: input.note,
      source: input.source ?? "staff",
      actorUserId: input.actorUserId ?? null,
      at,
    });
  }
}

/**
 * One-shot remap of pre-TOK-49 stage values (`intro`, `fit`, `contract_complete`).
 *
 * `db:push` cannot do this — the column is text and the values are data, not schema — so
 * the seed and any deploy against an existing database call it. Idempotent: a row already
 * on a canonical stage is left alone, so running it twice is a no-op rather than a
 * rewrite of history.
 */
export async function remapLegacyStages(): Promise<{ stages: number; events: number }> {
  const db = getDb();
  const rows = await db
    .select({
      id: pipelineStages.id,
      stage: pipelineStages.stage,
      fitConfirmedAt: pipelineStages.fitConfirmedAt,
    })
    .from(pipelineStages);

  let stages = 0;
  for (const row of rows) {
    if (isStage(row.stage)) continue;
    const to = migrateStage(row.stage, { fitConfirmed: Boolean(row.fitConfirmedAt) });
    await db
      .update(pipelineStages)
      .set({ stage: to, updatedAt: new Date() })
      .where(eq(pipelineStages.id, row.id));
    stages += 1;
  }

  // The history is what the stepper reads, so legacy hop rows are remapped too. `fit`
  // becomes consult_scheduled here regardless of the flag: the event records the moment
  // the consult was booked, and the confirmation is its own later row.
  const events = await db
    .select({ id: pipelineEvents.id, fromStage: pipelineEvents.fromStage, toStage: pipelineEvents.toStage })
    .from(pipelineEvents);
  let eventCount = 0;
  for (const row of events) {
    const from = row.fromStage === null ? null : migrateStage(row.fromStage);
    const to = migrateStage(row.toStage);
    if (from === row.fromStage && to === row.toStage) continue;
    await db
      .update(pipelineEvents)
      .set({ fromStage: from, toStage: to })
      .where(eq(pipelineEvents.id, row.id));
    eventCount += 1;
  }

  return { stages, events: eventCount };
}
