import { and, eq, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { emailTemplates, outboxMessages } from "@/db/schema";
import { sendTransactionalEmail } from "@/lib/adapters/resend";
import { newId } from "@/lib/ids";
import { assertPhiFree, renderTemplate } from "@/lib/phi";

export async function enqueueEmail(input: {
  organizationId: string;
  triggerKey: string;
  toEmail: string;
  vars: Record<string, string>;
}) {
  assertPhiFree(input.vars, "outbox enqueue");
  const db = getDb();
  const [template] = await db
    .select()
    .from(emailTemplates)
    .where(
      and(
        eq(emailTemplates.organizationId, input.organizationId),
        eq(emailTemplates.triggerKey, input.triggerKey),
        eq(emailTemplates.enabled, true),
      ),
    )
    .limit(1);

  const subject = template
    ? renderTemplate(template.subjectTpl, input.vars)
    : `Tokos: ${input.triggerKey}`;
  const bodyText = template
    ? renderTemplate(template.bodyTextTpl, input.vars)
    : `Open Tokos: ${input.vars.portal_url ?? ""}`;
  const bodyHtml = template
    ? renderTemplate(template.bodyHtmlTpl, input.vars)
    : `<p>${bodyText}</p>`;

  const id = newId();
  await db.insert(outboxMessages).values({
    id,
    organizationId: input.organizationId,
    templateId: template?.id,
    toEmail: input.toEmail,
    subject,
    bodyText,
    bodyHtml,
    status: "pending",
    provider: "stub",
    renderVars: input.vars,
  });
  return id;
}

export async function drainOutbox(limit = 20) {
  const db = getDb();
  const pending = await db
    .select()
    .from(outboxMessages)
    .where(
      and(
        eq(outboxMessages.status, "pending"),
        lte(outboxMessages.scheduledAt, new Date()),
      ),
    )
    .limit(limit);

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];

  for (const message of pending) {
    try {
      const sent = await sendTransactionalEmail({
        to: message.toEmail,
        subject: message.subject,
        html: message.bodyHtml,
        text: message.bodyText,
        tags: { organization_id: message.organizationId },
      });
      await db
        .update(outboxMessages)
        .set({
          status: "sent",
          provider: sent.provider,
          providerMessageId: sent.id,
          attempts: message.attempts + 1,
          sentAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(outboxMessages.id, message.id));
      results.push({ id: message.id, ok: true });
    } catch (error) {
      const lastError = error instanceof Error ? error.message : "send failed";
      await db
        .update(outboxMessages)
        .set({
          status: message.attempts + 1 >= 5 ? "failed" : "pending",
          attempts: message.attempts + 1,
          lastError,
          updatedAt: new Date(),
        })
        .where(eq(outboxMessages.id, message.id));
      results.push({ id: message.id, ok: false, error: lastError });
    }
  }

  return results;
}
