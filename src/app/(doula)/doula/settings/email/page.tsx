import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { organizations } from "@/db/schema";
import { requireStaff } from "@/lib/tenancy";
import { canManageTeam } from "@/lib/team";
import { orgEmailTemplates } from "@/lib/queries";
import {
  TRIGGER_DESCRIPTIONS,
  allowedVars,
  sampleVars,
} from "@/lib/email-templates";
import { SettingsTabs } from "@/components/brand/settings-tabs";
import { EmailTemplateEditor } from "@/components/brand/email-template-editor";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DoulaEmailTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string; saved?: string; error?: string; vars?: string }>;
}) {
  const query = await searchParams;
  const staff = await requireStaff();
  const manages = canManageTeam(staff.membershipRole);
  const templates = await orgEmailTemplates(staff.organizationId);
  const db = getDb();
  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, staff.organizationId))
    .limit(1);

  const selected =
    templates.find((template) => template.id === query.template) ?? templates[0] ?? null;

  const notice =
    query.error === "vars"
      ? {
          tone: "coral" as const,
          text: `Refused: ${query.vars ?? "an unknown variable"} is not supplied by this trigger. Form answers never go into email.`,
        }
      : query.error === "empty"
        ? { tone: "coral" as const, text: "A template needs a from name, a subject, and plain text." }
        : query.error === "missing"
          ? { tone: "coral" as const, text: "That template is not in your workspace." }
          : query.saved === "template"
            ? { tone: "teal" as const, text: "Template saved and a new version published." }
            : null;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-teal">Workspace</p>
          <h1 className="mt-1 font-heading text-[28px] font-semibold leading-tight tracking-[-0.02em] text-teal-ink">
            Email templates
          </h1>
          <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted-foreground">
            The transactional mail Tokos sends on your behalf. Every save publishes a new
            version alongside the live copy.
          </p>
        </div>
        <SettingsTabs />
      </header>

      {notice ? (
        <p
          className={cn(
            "rounded-lg px-3 py-2 text-sm ring-1",
            notice.tone === "coral"
              ? "bg-coral/10 text-coral ring-coral/20"
              : "bg-teal/10 text-teal-ink ring-teal/20",
          )}
        >
          {notice.text}
        </p>
      ) : null}

      <section className="rounded-xl bg-card ring-1 ring-teal/15">
        <div className="border-b border-teal/10 px-5 py-3.5">
          <h2 className="font-heading text-xl text-teal-ink">Triggers</h2>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            {templates.filter((template) => template.enabled).length} of {templates.length}{" "}
            enabled. A disabled trigger still sends — as a plain Tokos notice, not your words.
          </p>
        </div>
        {templates.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">
            No templates in this workspace yet.
          </p>
        ) : (
          <ul className="divide-y divide-teal/10">
            {templates.map((template) => (
              <li key={template.id}>
                <Link
                  href={`/doula/settings/email?template=${template.id}`}
                  aria-current={selected?.id === template.id ? "true" : undefined}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-3 px-5 py-3 transition-colors",
                    selected?.id === template.id ? "bg-teal/8" : "hover:bg-secondary",
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-teal-ink">
                      {template.name}
                      <span className="ml-2 font-mono text-[11.5px] font-normal text-muted-foreground">
                        {template.triggerKey}
                      </span>
                    </p>
                    <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
                      {template.subjectTpl}
                    </p>
                  </div>
                  <Badge
                    variant="secondary"
                    className={
                      template.enabled ? "bg-teal/12 text-teal-ink" : "bg-coral/12 text-coral"
                    }
                  >
                    {template.enabled ? `Enabled · v${template.version}` : "Disabled"}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selected ? (
        <EmailTemplateEditor
          key={selected.id}
          template={{
            id: selected.id,
            name: selected.name,
            triggerKey: selected.triggerKey,
            enabled: selected.enabled,
            fromName: selected.fromName,
            replyTo: selected.replyTo,
            subjectTpl: selected.subjectTpl,
            bodyTextTpl: selected.bodyTextTpl,
            bodyHtmlTpl: selected.bodyHtmlTpl,
            version: selected.version,
          }}
          allowed={allowedVars(selected.triggerKey)}
          sample={sampleVars(selected.triggerKey, org?.name ?? "Your practice")}
          description={TRIGGER_DESCRIPTIONS[selected.triggerKey] ?? "Transactional mail."}
          canEdit={manages}
        />
      ) : null}
    </div>
  );
}
