"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { emailTemplateVersions, emailTemplates, organizations } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { sanitizeBrand } from "@/lib/brand";
import { nextTemplateVersion, templateChanged, unknownVars } from "@/lib/email-templates";
import { newId } from "@/lib/ids";
import { requireStaffManager } from "@/lib/tenancy";

/**
 * Saves the practice brand. Every field goes through `sanitizeBrand` first, so the hex
 * that ends up in an inline style is a hex, the website is http(s), and the footer HTML
 * is reduced to inline formatting before it can reach a transactional email.
 */
export async function saveOrgBrandAction(formData: FormData) {
  const staff = await requireStaffManager();
  const db = getDb();
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, staff.organizationId))
    .limit(1);
  if (!org) redirect("/doula/settings?error=org");

  const next = sanitizeBrand(
    {
      portalName: formData.get("portalName") as string,
      primaryColor: formData.get("primaryColor") as string,
      websiteUrl: formData.get("websiteUrl") as string,
      onCallPhone: formData.get("onCallPhone") as string,
      footerHtml: formData.get("footerHtml") as string,
      confidentialityBlurb: formData.get("confidentialityBlurb") as string,
      timezone: formData.get("timezone") as string,
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
    .set({ ...next, updatedAt: new Date() })
    .where(eq(organizations.id, staff.organizationId));

  await writeAudit({
    organizationId: staff.organizationId,
    actorUserId: staff.userId,
    action: "org.brand_saved",
    entityType: "organization",
    entityId: staff.organizationId,
    metadata: { primary_color: next.primaryColor, timezone: next.timezone },
  });

  // The shell and the portal both read the org row on every request.
  revalidatePath("/doula/settings");
  revalidatePath("/doula");
  revalidatePath("/portal");
  redirect("/doula/settings?saved=brand");
}

/**
 * Saves one transactional template and publishes an immutable version row beside it.
 *
 * `unknownVars` is the firewall: a template may only mention the variables its trigger
 * actually supplies, so `{{answer_1}}` — or anything else reaching for what a family
 * typed into a form — is refused before the update rather than rendering as an empty
 * string at send time.
 */
export async function saveEmailTemplateAction(formData: FormData) {
  const staff = await requireStaffManager();
  const templateId = String(formData.get("templateId") ?? "");
  const db = getDb();
  const [template] = await db
    .select()
    .from(emailTemplates)
    .where(
      and(
        eq(emailTemplates.id, templateId),
        eq(emailTemplates.organizationId, staff.organizationId),
      ),
    )
    .limit(1);
  if (!template) redirect("/doula/settings/email?error=missing");

  const content = {
    subjectTpl: String(formData.get("subjectTpl") ?? "").trim(),
    bodyTextTpl: String(formData.get("bodyTextTpl") ?? "").trim(),
    bodyHtmlTpl: String(formData.get("bodyHtmlTpl") ?? "").trim(),
  };
  const fromName = String(formData.get("fromName") ?? "").trim();
  const replyToRaw = String(formData.get("replyTo") ?? "").trim();
  const enabled = formData.get("enabled") === "on";

  if (!content.subjectTpl || !content.bodyTextTpl || !fromName) {
    redirect(`/doula/settings/email?error=empty&template=${template.id}`);
  }
  const rejected = unknownVars(template.triggerKey, content);
  if (rejected.length > 0) {
    redirect(
      `/doula/settings/email?error=vars&template=${template.id}&vars=${encodeURIComponent(rejected.join(", "))}`,
    );
  }

  // A plain-text-only edit still needs an HTML body to send; wrap it rather than
  // shipping an empty one.
  const bodyHtmlTpl =
    content.bodyHtmlTpl ||
    content.bodyTextTpl
      .split(/\n{2,}/)
      .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br />")}</p>`)
      .join("");
  const nextContent = { ...content, bodyHtmlTpl };

  await db
    .update(emailTemplates)
    .set({
      enabled,
      fromName,
      replyTo: replyToRaw || null,
      ...nextContent,
      updatedAt: new Date(),
    })
    .where(eq(emailTemplates.id, template.id));

  // Versions are append-only history, so a toggle or a reply-to change alone does not
  // publish one — only the wording does.
  if (templateChanged(template, nextContent)) {
    const existing = await db
      .select({ version: emailTemplateVersions.version })
      .from(emailTemplateVersions)
      .where(eq(emailTemplateVersions.templateId, template.id));
    await db.insert(emailTemplateVersions).values({
      id: newId(),
      templateId: template.id,
      version: nextTemplateVersion(existing.map((row) => row.version)),
      ...nextContent,
      authoredByUserId: staff.userId,
    });
  }

  await writeAudit({
    organizationId: staff.organizationId,
    actorUserId: staff.userId,
    action: "email_template.saved",
    entityType: "email_template",
    entityId: template.id,
    metadata: { trigger_key: template.triggerKey, enabled: String(enabled) },
  });

  revalidatePath("/doula/settings/email");
  redirect(`/doula/settings/email?saved=template&template=${template.id}`);
}
