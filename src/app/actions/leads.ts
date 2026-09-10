"use server";

/**
 * Lead/CRM writes (TOK-49).
 *
 * Every action here is reachable by a direct POST, so none of them trusts the page that
 * rendered the form: the client id is re-read org-scoped through `requireStaffClient`,
 * the role is re-checked for anything that is agency machinery, and posted picker values
 * are validated against `@/lib/lead-fields` rather than written through.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, memberships } from "@/db/schema";
import { requireStaffClient, requireStaffManager } from "@/lib/tenancy";
import { appendClientNote, logClientContact, setPipelineStage } from "@/lib/funnel";
import { parseLeadFields, LEAD_FIELDS_BY_KEY, type LeadFieldKey } from "@/lib/lead-fields";
import { shellPersona } from "@/lib/shell-persona";
import { mapCsv, planImport, planSummary } from "@/lib/csv-import";
import { applyImportPlan, existingClientsFor, ownerLookup } from "@/lib/lead-import";
import { writeAudit } from "@/lib/audit";

function refreshClient(clientId: string) {
  revalidatePath("/doula");
  revalidatePath("/doula/clients");
  revalidatePath(`/doula/clients/${clientId}`);
}

/** The stage dropdown. A backward move only lands when the form carried the confirm. */
export async function setStageAction(formData: FormData) {
  const clientId = String(formData.get("clientId") ?? "");
  const to = String(formData.get("stage") ?? "");
  const confirmed = formData.get("confirmed") === "yes";
  if (!clientId || !to) return;
  const { staff, client } = await requireStaffClient(clientId);

  const result = await setPipelineStage({
    organizationId: staff.organizationId,
    clientId: client.id,
    actorUserId: staff.userId,
    to,
    confirmed,
  });
  refreshClient(client.id);
  if (!result.ok) {
    redirect(`/doula/clients/${client.id}?stageError=${encodeURIComponent(result.reason)}`);
  }
}

/**
 * The lead fields form. `parseLeadFields` is handed the persona, so the agency-only keys
 * (Source, Intake #) are not merely hidden from a doula's form — they are not read from
 * her POST either.
 */
export async function saveLeadFieldsAction(formData: FormData) {
  const clientId = String(formData.get("clientId") ?? "");
  if (!clientId) return;
  const { staff, client } = await requireStaffClient(clientId);
  const persona = shellPersona(staff.membershipRole);

  const values = parseLeadFields((key) => {
    // `has` distinguishes "field not on this form" from "field cleared", so a partial
    // form never blanks a column it did not render.
    return formData.has(key) ? formData.get(key) : undefined;
  }, persona);

  if (Object.keys(values).length === 0) return;

  const update: Record<string, string | null | Date> = { updatedAt: new Date() };
  for (const [key, value] of Object.entries(values)) {
    const field = LEAD_FIELDS_BY_KEY[key as LeadFieldKey];
    if (!field) continue;
    // Insurance is NOT NULL with an `unknown` default: clearing it means "we don't know",
    // not "no value".
    update[key] = key === "insurance" ? (value ?? "unknown") : value;
  }

  const db = getDb();
  await db
    .update(clients)
    .set(update)
    .where(and(eq(clients.organizationId, staff.organizationId), eq(clients.id, client.id)));

  refreshClient(client.id);
}

/** Append one line to the notes feed. */
export async function appendLeadNoteAction(formData: FormData) {
  const clientId = String(formData.get("clientId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!clientId || !body) return;
  const { staff, client } = await requireStaffClient(clientId);
  await appendClientNote({
    organizationId: staff.organizationId,
    clientId: client.id,
    body,
    source: "staff",
    actorUserId: staff.userId,
  });
  refreshClient(client.id);
}

/**
 * Two-tap contact log. The note is optional on purpose — a doula who has to write a
 * paragraph will not log the text she just sent, and then Last Contact rots.
 */
export async function logContactAction(formData: FormData) {
  const clientId = String(formData.get("clientId") ?? "");
  if (!clientId) return;
  const { staff, client } = await requireStaffClient(clientId);
  await logClientContact({
    organizationId: staff.organizationId,
    clientId: client.id,
    actorUserId: staff.userId,
    note: String(formData.get("note") ?? "").trim() || undefined,
  });
  refreshClient(client.id);
}

/** Owner reassignment. Agency machinery: owner/admin only, and the owner must be staff here. */
export async function setLeadOwnerAction(formData: FormData) {
  const staff = await requireStaffManager();
  const clientId = String(formData.get("clientId") ?? "");
  const ownerUserId = String(formData.get("ownerUserId") ?? "").trim();
  if (!clientId) return;
  const { client } = await requireStaffClient(clientId);

  const db = getDb();
  let owner: string | null = null;
  if (ownerUserId) {
    // A posted user id only counts if it is a membership of *this* org.
    const [member] = await db
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(
        and(
          eq(memberships.organizationId, staff.organizationId),
          eq(memberships.userId, ownerUserId),
        ),
      )
      .limit(1);
    if (!member) throw new Error("Forbidden");
    owner = member.userId;
  }

  await db
    .update(clients)
    .set({ ownerUserId: owner, updatedAt: new Date() })
    .where(and(eq(clients.organizationId, staff.organizationId), eq(clients.id, client.id)));

  refreshClient(client.id);
}

/** The founder's QA checkbox. */
export async function setReviewedAction(formData: FormData) {
  const staff = await requireStaffManager();
  const clientId = String(formData.get("clientId") ?? "");
  if (!clientId) return;
  const { client } = await requireStaffClient(clientId);
  const reviewed = String(formData.get("reviewed") ?? "") === "yes";

  const db = getDb();
  await db
    .update(clients)
    .set({
      reviewed,
      reviewedAt: reviewed ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(and(eq(clients.organizationId, staff.organizationId), eq(clients.id, client.id)));

  refreshClient(client.id);
}

/**
 * CSV lead import (TOK-49).
 *
 * Owner/admin only and org-scoped end to end. Dedupe is by Intake # first and email
 * second, so re-importing a corrected export updates the same rows instead of doubling
 * the board — `planImport` decides that, and it is tested against the fixture.
 */
export async function importLeadsCsvAction(formData: FormData) {
  const staff = await requireStaffManager();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect("/doula/clients/import?error=" + encodeURIComponent("Choose a CSV file first."));
  }

  const text = await (file as File).text();
  const mapped = mapCsv(text);
  if (mapped.records.length === 0) {
    const detail = mapped.errors[0]?.message ?? "No rows the importer could read.";
    redirect(`/doula/clients/import?error=${encodeURIComponent(detail)}`);
  }

  const [existing, ownerByName] = await Promise.all([
    existingClientsFor(staff.organizationId),
    // Owner arrives as a name, so it is resolved against this org's roster; an unmatched
    // name leaves the lead unowned rather than guessing at a person.
    ownerLookup(staff.organizationId),
  ]);

  const plan = planImport(mapped.records, existing, mapped.errors);
  await applyImportPlan({
    organizationId: staff.organizationId,
    actorUserId: staff.userId,
    plan,
    ownerByName,
  });

  await writeAudit({
    organizationId: staff.organizationId,
    actorUserId: staff.userId,
    action: "leads.imported",
    entityType: "organization",
    entityId: staff.organizationId,
    metadata: {
      creates: String(plan.creates),
      updates: String(plan.updates),
      skipped: String(plan.skipped),
      errors: String(plan.errors.length),
    },
  });

  revalidatePath("/doula");
  revalidatePath("/doula/clients");
  redirect(`/doula/clients/import?done=${encodeURIComponent(planSummary(plan))}`);
}
