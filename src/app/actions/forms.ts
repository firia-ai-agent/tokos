"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { formAssignments, formSubmissions, formTemplates } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { appUrl } from "@/lib/env";
import { assignableToFamily, isFormAudience } from "@/lib/form-audience";
import {
  assertAnswersNotInEmail,
  formReminderVars,
  parseFieldSpec,
  readAnswers,
} from "@/lib/forms";
import { newId } from "@/lib/ids";
import { enqueueEmail } from "@/lib/outbox";
import { requireStaff, requireStaffClient } from "@/lib/tenancy";

/** Every form page a doula touches; a write refreshes the family's view too. */
function revalidateForms(clientId?: string) {
  revalidatePath("/doula/forms");
  revalidatePath("/doula");
  if (clientId) revalidatePath(`/doula/clients/${clientId}`);
  revalidatePath("/portal");
  revalidatePath("/portal/forms");
}

/**
 * A template belongs to the staff org, so it is loaded by id **and** org — a posted id
 * from another tenant reads back as nothing rather than as someone else's questions.
 */
async function loadTemplate(organizationId: string, templateId: string) {
  if (!templateId) return null;
  const db = getDb();
  const [template] = await db
    .select()
    .from(formTemplates)
    .where(
      and(eq(formTemplates.id, templateId), eq(formTemplates.organizationId, organizationId)),
    )
    .limit(1);
  return template ?? null;
}

async function loadAssignment(organizationId: string, assignmentId: string) {
  if (!assignmentId) return null;
  const db = getDb();
  const [assignment] = await db
    .select()
    .from(formAssignments)
    .where(
      and(
        eq(formAssignments.id, assignmentId),
        eq(formAssignments.organizationId, organizationId),
      ),
    )
    .limit(1);
  return assignment ?? null;
}

export async function createFormTemplateAction(formData: FormData) {
  const staff = await requireStaff();
  const title = String(formData.get("title") ?? "").trim();
  const kind = String(formData.get("kind") ?? "intake").trim() || "intake";
  // A template the doula builds for herself must be markable as staff work up front,
  // or the only way to keep it off a family's portal is to remember not to send it.
  const audienceRaw = String(formData.get("audience") ?? "family");
  const audience = isFormAudience(audienceRaw) ? audienceRaw : "family";
  const fields = parseFieldSpec(String(formData.get("fields") ?? ""));

  if (!title) redirect("/doula/forms?error=title");
  if (fields.length === 0) redirect("/doula/forms?error=fields");

  const db = getDb();
  const id = newId();
  await db.insert(formTemplates).values({
    id,
    organizationId: staff.organizationId,
    title,
    kind,
    audience,
    schemaJson: { fields },
    version: 1,
  });
  // Field labels are the doula's own wording and can be sensitive, so the audit row
  // keeps counts and ids only.
  await writeAudit({
    organizationId: staff.organizationId,
    actorUserId: staff.userId,
    action: "form_template.created",
    entityType: "form_template",
    entityId: id,
    metadata: { field_count: String(fields.length), kind, audience },
  });

  revalidateForms();
  redirect("/doula/forms?created=template");
}

export async function assignFormAction(formData: FormData) {
  const templateId = String(formData.get("templateId") ?? "");
  const clientId = String(formData.get("clientId") ?? "");
  if (!templateId || !clientId) redirect("/doula/forms?error=assign");

  const { staff, client } = await requireStaffClient(clientId);
  const template = await loadTemplate(staff.organizationId, templateId);
  if (!template) redirect("/doula/forms?error=assign");
  // The picker only offers family templates, but a posted id is a posted id. A staff
  // form on a family's Incomplete list is the Dubsado bug TOK-50 exists to not repeat.
  if (!assignableToFamily(template)) redirect("/doula/forms?error=staff_only");

  const db = getDb();
  const [existing] = await db
    .select()
    .from(formAssignments)
    .where(
      and(
        eq(formAssignments.organizationId, staff.organizationId),
        eq(formAssignments.templateId, template.id),
        eq(formAssignments.clientId, client.id),
        eq(formAssignments.status, "incomplete"),
      ),
    )
    .limit(1);
  if (existing) {
    revalidateForms(client.id);
    redirect("/doula/forms?error=duplicate");
  }

  const assigneeRole = String(formData.get("assigneeRole") ?? "either");
  const dueRaw = String(formData.get("dueAt") ?? "").trim();
  const dueAt = dueRaw ? new Date(`${dueRaw}T12:00:00`) : null;

  const id = newId();
  await db.insert(formAssignments).values({
    id,
    organizationId: staff.organizationId,
    templateId: template.id,
    clientId: client.id,
    status: "incomplete",
    assigneeRole: ["client", "doula", "either"].includes(assigneeRole) ? assigneeRole : "either",
    dueAt: dueAt && !Number.isNaN(dueAt.getTime()) ? dueAt : null,
  });

  if (String(formData.get("notify") ?? "") === "on") {
    const [open] = await db
      .select({ n: count() })
      .from(formAssignments)
      .where(
        and(
          eq(formAssignments.organizationId, staff.organizationId),
          eq(formAssignments.clientId, client.id),
          eq(formAssignments.status, "incomplete"),
        ),
      );
    // Counts and a link only — the questions themselves stay behind the portal login.
    await enqueueEmail({
      organizationId: staff.organizationId,
      triggerKey: "form_reminder",
      toEmail: client.email,
      vars: formReminderVars({
        clientName: client.preferredName ?? client.displayName,
        portalUrl: `${appUrl()}/portal/forms`,
        openCount: Number(open?.n ?? 1),
      }),
    });
  }

  await writeAudit({
    organizationId: staff.organizationId,
    actorUserId: staff.userId,
    action: "form_assignment.created",
    entityType: "form_assignment",
    entityId: id,
    metadata: { client_id: client.id, template_id: template.id },
  });

  revalidateForms(client.id);
  redirect("/doula/forms?created=assignment");
}

/**
 * Co-complete: the doula fills a form sitting next to the family. It writes the same
 * submission row the portal writes, stamped with the staff user so the answer card can
 * say who typed it.
 */
export async function coCompleteFormAction(formData: FormData) {
  const staff = await requireStaff();
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const assignment = await loadAssignment(staff.organizationId, assignmentId);
  if (!assignment) return;

  const answers = readAnswers(formData.entries());
  const db = getDb();
  await db.insert(formSubmissions).values({
    id: newId(),
    organizationId: staff.organizationId,
    assignmentId: assignment.id,
    submittedByUserId: staff.userId,
    answersJson: answers,
  });
  await db
    .update(formAssignments)
    .set({ status: "complete", updatedAt: new Date() })
    .where(eq(formAssignments.id, assignment.id));

  // Answers are never audit metadata — ids only.
  await writeAudit({
    organizationId: staff.organizationId,
    actorUserId: staff.userId,
    action: "form_assignment.co_completed",
    entityType: "form_assignment",
    entityId: assignment.id,
    metadata: { client_id: assignment.clientId },
  });

  revalidateForms(assignment.clientId);
}

/** Puts a form back in the family's queue without deleting what was already answered. */
export async function reopenFormAction(formData: FormData) {
  const staff = await requireStaff();
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const assignment = await loadAssignment(staff.organizationId, assignmentId);
  if (!assignment) return;

  const db = getDb();
  await db
    .update(formAssignments)
    .set({ status: "incomplete", updatedAt: new Date() })
    .where(eq(formAssignments.id, assignment.id));

  revalidateForms(assignment.clientId);
}

/**
 * Reminder for one assignment. The recipient is read off the org-scoped client row, and
 * the vars go through the same firewall as every other form email: name, link, count.
 */
export async function remindAssignmentAction(formData: FormData) {
  const staff = await requireStaff();
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const assignment = await loadAssignment(staff.organizationId, assignmentId);
  if (!assignment) return;

  const { client } = await requireStaffClient(assignment.clientId);
  const db = getDb();
  const [open] = await db
    .select({ n: count() })
    .from(formAssignments)
    .where(
      and(
        eq(formAssignments.organizationId, staff.organizationId),
        eq(formAssignments.clientId, client.id),
        eq(formAssignments.status, "incomplete"),
      ),
    );

  const vars = formReminderVars({
    clientName: client.preferredName ?? client.displayName,
    portalUrl: `${appUrl()}/portal/forms`,
    openCount: Number(open?.n ?? 1),
  });
  // A reminder is sent about a form that may already hold answers, so the guard runs
  // against the latest submission rather than trusting the var builder alone.
  const [latest] = await db
    .select()
    .from(formSubmissions)
    .where(eq(formSubmissions.assignmentId, assignment.id))
    .orderBy(desc(formSubmissions.submittedAt))
    .limit(1);
  assertAnswersNotInEmail(vars, latest?.answersJson ?? {}, "form reminder");

  await enqueueEmail({
    organizationId: staff.organizationId,
    triggerKey: "form_reminder",
    toEmail: client.email,
    vars,
  });

  revalidateForms(client.id);
}

/**
 * Batch send (TOK-50 / CRM-FIRST §2).
 *
 * The old library made a doula repeat the same family pick once per card: every template
 * carried its own `<select>` and its own Assign button. Sending four forms to one family
 * was four round trips and four chances to pick the wrong name. These two actions take
 * the whole selection at once — templates × families — and write it in one pass.
 *
 * Rules that survive the batch, because they are the ones that cost something:
 *  - audience: a staff template is skipped, never assigned. Silently would be a lie, so
 *    the redirect says how many were skipped.
 *  - idempotence: a family who already has that form open is left alone rather than
 *    given a second copy of the same questions.
 *  - tenancy: templates and clients are both re-read org-scoped before anything is written.
 */
async function sendFormsToClients(input: {
  organizationId: string;
  actorUserId: string;
  templateIds: string[];
  clientIds: string[];
  assigneeRole: string;
  dueAt: Date | null;
  notify: boolean;
}) {
  const db = getDb();
  const templateIds = [...new Set(input.templateIds.filter(Boolean))];
  const clientIds = [...new Set(input.clientIds.filter(Boolean))];
  if (templateIds.length === 0 || clientIds.length === 0) {
    return { sent: 0, skippedStaff: 0, skippedDuplicate: 0, clientIds: [] as string[] };
  }

  const templates = await db
    .select()
    .from(formTemplates)
    .where(
      and(
        eq(formTemplates.organizationId, input.organizationId),
        inArray(formTemplates.id, templateIds),
      ),
    );

  const sendable = templates.filter((template) => assignableToFamily(template));
  const skippedStaff = templates.length - sendable.length;
  if (sendable.length === 0) {
    return { sent: 0, skippedStaff, skippedDuplicate: 0, clientIds: [] as string[] };
  }

  // One read of what is already open, rather than a select per pair.
  const openRows = await db
    .select({ templateId: formAssignments.templateId, clientId: formAssignments.clientId })
    .from(formAssignments)
    .where(
      and(
        eq(formAssignments.organizationId, input.organizationId),
        eq(formAssignments.status, "incomplete"),
        inArray(formAssignments.clientId, clientIds),
      ),
    );
  const alreadyOpen = new Set(openRows.map((row) => `${row.templateId}:${row.clientId}`));

  const assigneeRole = ["client", "doula", "either"].includes(input.assigneeRole)
    ? input.assigneeRole
    : "either";

  const values: Array<typeof formAssignments.$inferInsert> = [];
  let skippedDuplicate = 0;
  for (const client of clientIds) {
    for (const template of sendable) {
      if (alreadyOpen.has(`${template.id}:${client}`)) {
        skippedDuplicate += 1;
        continue;
      }
      values.push({
        id: newId(),
        organizationId: input.organizationId,
        templateId: template.id,
        clientId: client,
        status: "incomplete",
        assigneeRole,
        dueAt: input.dueAt,
      });
    }
  }

  if (values.length > 0) await db.insert(formAssignments).values(values);

  const touched = [...new Set(values.map((row) => row.clientId))];

  if (input.notify && touched.length > 0) {
    for (const clientId of touched) {
      const { client } = await requireStaffClient(clientId);
      const [open] = await db
        .select({ n: count() })
        .from(formAssignments)
        .where(
          and(
            eq(formAssignments.organizationId, input.organizationId),
            eq(formAssignments.clientId, clientId),
            eq(formAssignments.status, "incomplete"),
          ),
        );
      // Counts and a link only — the questions stay behind the portal login.
      await enqueueEmail({
        organizationId: input.organizationId,
        triggerKey: "form_reminder",
        toEmail: client.email,
        vars: formReminderVars({
          clientName: client.preferredName ?? client.displayName,
          portalUrl: `${appUrl()}/portal/forms`,
          openCount: Number(open?.n ?? 1),
        }),
      });
    }
  }

  // Counts and ids only — a template title is the doula's wording, an answer is never here.
  if (values.length > 0) {
    await writeAudit({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: "form_assignment.batch_created",
      entityType: "form_assignment",
      entityId: values[0]!.id,
      metadata: {
        sent: String(values.length),
        families: String(touched.length),
        templates: String(sendable.length),
        skipped_staff: String(skippedStaff),
        skipped_duplicate: String(skippedDuplicate),
      },
    });
  }

  return { sent: values.length, skippedStaff, skippedDuplicate, clientIds: touched };
}

/** Every family is already known here: `/doula/clients/[id]` sends to this one record. */
export async function assignFormsToClientAction(formData: FormData) {
  const clientId = String(formData.get("clientId") ?? "");
  if (!clientId) redirect("/doula/forms?error=assign");
  const { staff, client } = await requireStaffClient(clientId);

  const templateIds = formData.getAll("templateIds").map(String);
  if (templateIds.length === 0) redirect(`/doula/clients/${client.id}?formsError=pick#forms`);

  const dueRaw = String(formData.get("dueAt") ?? "").trim();
  const parsedDue = dueRaw ? new Date(`${dueRaw}T12:00:00`) : null;

  const result = await sendFormsToClients({
    organizationId: staff.organizationId,
    actorUserId: staff.userId,
    templateIds,
    clientIds: [client.id],
    assigneeRole: String(formData.get("assigneeRole") ?? "either"),
    dueAt: parsedDue && !Number.isNaN(parsedDue.getTime()) ? parsedDue : null,
    notify: String(formData.get("notify") ?? "") === "on",
  });

  revalidateForms(client.id);
  if (result.sent === 0) {
    redirect(
      `/doula/clients/${client.id}?formsError=${result.skippedStaff > 0 ? "staff_only" : "duplicate"}#forms`,
    );
  }
  redirect(`/doula/clients/${client.id}?formsSent=${result.sent}#forms`);
}

/** The library path: N templates → N families, one button (`/doula/forms`). */
export async function assignFormsToFamiliesAction(formData: FormData) {
  const staff = await requireStaff();
  const templateIds = formData.getAll("templateIds").map(String);
  const clientIds = formData.getAll("clientIds").map(String);
  if (templateIds.length === 0 || clientIds.length === 0) redirect("/doula/forms?error=assign");

  // Assignment scope is the guard: a doula may only send to her own families, and
  // `requireStaffClient` re-checks each one before a row is written for it.
  for (const clientId of clientIds) await requireStaffClient(clientId);

  const dueRaw = String(formData.get("dueAt") ?? "").trim();
  const parsedDue = dueRaw ? new Date(`${dueRaw}T12:00:00`) : null;

  const result = await sendFormsToClients({
    organizationId: staff.organizationId,
    actorUserId: staff.userId,
    templateIds,
    clientIds,
    assigneeRole: String(formData.get("assigneeRole") ?? "either"),
    dueAt: parsedDue && !Number.isNaN(parsedDue.getTime()) ? parsedDue : null,
    notify: String(formData.get("notify") ?? "") === "on",
  });

  for (const clientId of result.clientIds) revalidateForms(clientId);
  revalidateForms();
  if (result.sent === 0) {
    redirect(
      `/doula/forms?error=${result.skippedStaff > 0 ? "staff_only" : "duplicate"}`,
    );
  }
  redirect(`/doula/forms?created=assignment&sent=${result.sent}`);
}
