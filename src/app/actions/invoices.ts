"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, invoiceLines, invoices, organizations, paymentStatuses } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { sanitizeBrand } from "@/lib/brand";
import { markInvoicePaid } from "@/lib/funnel";
import { appUrl } from "@/lib/env";
import { enqueueEmail } from "@/lib/outbox";
import { newId } from "@/lib/ids";
import {
  DEFAULT_PAYMENT_TERM_DAYS,
  PAYMENT_TERMS,
  dueDateFrom,
  invoiceCleared,
  nextInvoiceNumber,
  parseAmountToCents,
} from "@/lib/invoice-dashboard";
import { openPaymentStatus } from "@/lib/payment-status";
import { requireStaff, requireStaffManager } from "@/lib/tenancy";

const INVOICES_PATH = "/doula/invoices";

/**
 * Where a money action returns to (TOK-77).
 *
 * These actions grew up on `/doula/invoices` and always bounced back to it. The family
 * record now fires the same ones, and landing a doula on the ledger after she marked one
 * invoice paid from a family's page is the small rudeness that makes people stop using
 * the button. The form declares where it came from; an absent `returnClientId` keeps the
 * dashboard's existing behaviour exactly.
 *
 * The id is pasted into a URL, so it is filtered rather than trusted — a hand-rolled POST
 * does not get to choose where the browser goes next.
 */
function moneyRedirect(returnClientId: string, key: "saved" | "error", value: string): string {
  const id = returnClientId.replace(/[^a-zA-Z0-9-]/g, "");
  if (id) return `/doula/clients/${id}?money=${value}#money`;
  return `${INVOICES_PATH}?${key}=${value}`;
}

function readReturnClientId(formData: FormData): string {
  return String(formData.get("returnClientId") ?? "").trim();
}

/** Every surface that counts this money has to move when one invoice does. */
function revalidateMoney(clientId: string) {
  revalidatePath(INVOICES_PATH);
  revalidatePath("/doula/invoices/families");
  revalidatePath("/doula/invoices/packages");
  revalidatePath("/doula");
  revalidatePath("/doula/review");
  revalidatePath(`/doula/clients/${clientId}`);
  revalidatePath("/portal");
  revalidatePath("/portal/pay");
}

/**
 * Raises an open invoice against a family by hand (TOK-55).
 *
 * The care-agreement flow raises its own invoice from the package amount; this is the
 * other half a practice actually needs — a top-up visit, a late-night call-out, a
 * deposit taken before the paperwork. It writes the same shape `sendContract` writes, so
 * the family's Pay button, the KPI strip and the Needs-attention rule all treat it as an
 * ordinary invoice, and it is deliberately born `open`: raising a bill is not receiving
 * money, and nothing here may say otherwise.
 */
export async function createInvoiceAction(formData: FormData) {
  const staff = await requireStaff();
  const clientId = String(formData.get("clientId") ?? "").trim();
  const amountCents = parseAmountToCents(formData.get("amount") as string);
  const description = String(formData.get("description") ?? "").trim();
  const termDays = Number(formData.get("termDays") ?? DEFAULT_PAYMENT_TERM_DAYS);

  if (!clientId) redirect(`${INVOICES_PATH}?error=family`);
  if (!amountCents) redirect(`${INVOICES_PATH}?error=amount`);

  const db = getDb();
  // The posted id names the family; the row is re-read in the session's own org, so a
  // hand-rolled POST cannot bill a client in someone else's practice.
  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.organizationId, staff.organizationId)))
    .limit(1);
  if (!client) redirect(`${INVOICES_PATH}?error=family`);

  const existing = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(eq(invoices.organizationId, staff.organizationId));

  const days = PAYMENT_TERMS.some((term) => term.days === termDays)
    ? termDays
    : DEFAULT_PAYMENT_TERM_DAYS;
  const issuedAt = new Date();
  const invoiceId = newId();
  const number = nextInvoiceNumber(existing.length);

  await db.insert(invoices).values({
    id: invoiceId,
    organizationId: staff.organizationId,
    clientId: client.id,
    number,
    status: "open",
    amountCents,
    dueAt: dueDateFrom(issuedAt, days),
  });
  await db.insert(invoiceLines).values({
    id: newId(),
    organizationId: staff.organizationId,
    invoiceId,
    description: description || "Doula care",
    quantity: 1,
    unitAmountCents: amountCents,
  });
  // The row `sendContract` opens for a contract-backed bill, opened here too (TOK-61).
  // Without it a hand invoice had nowhere to record a decline, a refund, or a debit still
  // clearing, so the family's pay page could only ever say "due" — and `due` is precisely
  // what it is born as, because raising a bill is not receiving money.
  await openPaymentStatus({
    organizationId: staff.organizationId,
    invoiceId,
    amountCents,
  });

  await writeAudit({
    organizationId: staff.organizationId,
    actorUserId: staff.userId,
    action: "invoice.created",
    entityType: "invoice",
    entityId: invoiceId,
    metadata: { number, amount_cents: String(amountCents), term_days: String(days) },
  });

  revalidateMoney(client.id);
  redirect(`${INVOICES_PATH}?saved=created`);
}

/**
 * Records money that arrived outside Tokos — the founder's "payments received outside
 * Tokos can be recorded manually and linked to the related invoice".
 *
 * This is the one place a human, rather than Stripe, says money landed, so it is fenced:
 * the invoice is re-read in the caller's org, an already-cleared invoice is refused
 * rather than double-recorded, and the write goes through `markInvoicePaid` so the
 * invoice row, the payment row and the pipeline advance exactly as they do for a card.
 * The reference is kept on the payment record and in the audit log, because the only
 * evidence this payment ever existed is the person who typed it.
 */
export async function recordExternalPaymentAction(formData: FormData) {
  const staff = await requireStaff();
  const invoiceId = String(formData.get("invoiceId") ?? "").trim();
  const reference = String(formData.get("reference") ?? "").trim().slice(0, 120);
  const returnClientId = readReturnClientId(formData);

  const db = getDb();
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.organizationId, staff.organizationId)))
    .limit(1);
  if (!invoice) redirect(moneyRedirect(returnClientId, "error", "missing"));
  if (invoiceCleared({ status: invoice.status, paymentStatus: null })) {
    redirect(moneyRedirect(returnClientId, "error", "cleared"));
  }

  await markInvoicePaid({
    organizationId: staff.organizationId,
    invoiceId: invoice.id,
    actorUserId: staff.userId,
    method: "manual",
    externalId: reference ? `manual:${reference}` : undefined,
  });

  await writeAudit({
    organizationId: staff.organizationId,
    actorUserId: staff.userId,
    action: "invoice.paid_externally",
    entityType: "invoice",
    entityId: invoice.id,
    metadata: { number: invoice.number, reference: reference || "none" },
  });

  revalidateMoney(invoice.clientId);
  redirect(moneyRedirect(returnClientId, "saved", "recorded"));
}

/**
 * Nudges a family about an invoice that is still owed (TOK-77).
 *
 * "Chase payment" is the verb a doula reaches for on a family record, and before this it
 * did not exist anywhere in the product — the only reminder that ever went out was the
 * one `sendContract` enqueued the day the invoice was raised. This re-sends *that* email,
 * the org's own `invoice_due` template, rather than inventing a second reminder voice or
 * a dunning schedule nobody asked for.
 *
 * A settled or cancelled invoice is refused rather than quietly re-sent: the failure mode
 * here is a family who has already paid being asked again, and that is worse than a
 * button that says no.
 */
export async function chaseInvoiceAction(formData: FormData) {
  const staff = await requireStaff();
  const invoiceId = String(formData.get("invoiceId") ?? "").trim();
  const returnClientId = readReturnClientId(formData);

  const db = getDb();
  const [row] = await db
    .select({ invoice: invoices, paymentStatus: paymentStatuses.status, client: clients })
    .from(invoices)
    .leftJoin(paymentStatuses, eq(paymentStatuses.contractId, invoices.contractId))
    .innerJoin(clients, eq(clients.id, invoices.clientId))
    .where(and(eq(invoices.id, invoiceId), eq(invoices.organizationId, staff.organizationId)))
    .limit(1);
  if (!row) redirect(moneyRedirect(returnClientId, "error", "missing"));

  // The payment row is the one that touched the money, so it decides whether anything is
  // still owed — the same read the badge on the card does (TOK-48).
  if (invoiceCleared({ status: row.invoice.status, paymentStatus: row.paymentStatus })) {
    redirect(moneyRedirect(returnClientId, "error", "cleared"));
  }

  await enqueueEmail({
    organizationId: staff.organizationId,
    triggerKey: "invoice_due",
    toEmail: row.client.email,
    vars: {
      client_name: row.client.preferredName || row.client.displayName,
      portal_url: `${appUrl()}/portal/pay`,
      invoice_number: row.invoice.number,
    },
  });

  await writeAudit({
    organizationId: staff.organizationId,
    actorUserId: staff.userId,
    action: "invoice.chased",
    entityType: "invoice",
    entityId: row.invoice.id,
    metadata: { number: row.invoice.number },
  });

  revalidateMoney(row.invoice.clientId);
  redirect(moneyRedirect(returnClientId, "saved", "chased"));
}

/**
 * Saves the business details that print at the top of an invoice.
 *
 * These are the practice's brand fields, not a second copy of them: the name, site, phone
 * and colour a family reads on an invoice are the same ones she reads in the portal, and
 * keeping one row means an invoice can never go out under last year's name. Everything
 * goes through `sanitizeBrand` for the same reason the settings form does.
 */
export async function saveInvoiceTemplateAction(formData: FormData) {
  const staff = await requireStaffManager();
  const db = getDb();
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, staff.organizationId))
    .limit(1);
  if (!org) redirect("/doula/invoices/templates?error=brand");

  const next = sanitizeBrand(
    {
      portalName: formData.get("portalName") as string,
      primaryColor: formData.get("primaryColor") as string,
      websiteUrl: formData.get("websiteUrl") as string,
      onCallPhone: formData.get("onCallPhone") as string,
    },
    {
      portalName: org.portalName,
      primaryColor: org.primaryColor,
      websiteUrl: org.websiteUrl,
      onCallPhone: org.onCallPhone,
      footerHtml: org.footerHtml,
      confidentialityBlurb: org.confidentialityBlurb,
      timezone: org.timezone,
    },
  );

  await db
    .update(organizations)
    .set({
      portalName: next.portalName,
      primaryColor: next.primaryColor,
      websiteUrl: next.websiteUrl,
      onCallPhone: next.onCallPhone,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, staff.organizationId));

  await writeAudit({
    organizationId: staff.organizationId,
    actorUserId: staff.userId,
    action: "org.invoice_template_saved",
    entityType: "organization",
    entityId: staff.organizationId,
    metadata: { primary_color: next.primaryColor },
  });

  revalidatePath("/doula/invoices/templates");
  revalidatePath("/doula/settings");
  revalidatePath("/portal");
  redirect("/doula/invoices/templates?saved=template");
}
