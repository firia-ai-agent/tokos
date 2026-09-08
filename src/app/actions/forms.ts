"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, count, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { formAssignments, formSubmissions, formTemplates } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { appUrl } from "@/lib/env";
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
    metadata: { field_count: String(fields.length), kind },
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
