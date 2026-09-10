import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { organizations } from "@/db/schema";
import { redirect } from "next/navigation";
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

/** `?template=` value that means every row is closed. No template id can collide with it. */
const COLLAPSED = "none";

export default async function DoulaEmailTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string; saved?: string; error?: string; vars?: string }>;
}) {
  const query = await searchParams;
  const staff = await requireStaff();
  // TOK-34 D1: this is agency chrome. It is out of the doula shell's nav and search, so
  // a member with role `doula` who deep-links here is sent back to her own practice
  // rather than shown templates she has no part in running.
  if (!canManageTeam(staff.membershipRole)) redirect("/doula");
  const manages = canManageTeam(staff.membershipRole);
  const templates = await orgEmailTemplates(staff.organizationId);
  const db = getDb();
  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, staff.organizationId))
    .limit(1);

  // No `?template=` at all means "just arrived" — the first trigger opens so the page is
  // never a wall of closed rows. Once she has clicked, the query is the truth, and the
  // sentinel below lets her close the last open one instead of it springing back.
  const selected =
    query.template === undefined
      ? templates[0] ?? null
      : templates.find((template) => template.id === query.template) ?? null;

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

      {/* One accordion, not a list above and an editor below (TOK-57). Every trigger is
          one line until you open it, and the one you opened holds its editor in place —
          so the page is as long as the work you are doing, not as long as the catalogue.
          The open row is the `?template=` query, so it survives a save and a reload and
          needs no client state. */}
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
            {templates.map((template) => {
              const open = selected?.id === template.id;
              return (
                <li key={template.id} id={`tpl-${template.id}`}>
                  <Link
                    href={
                      open
                        ? `/doula/settings/email?template=${COLLAPSED}`
                        : `/doula/settings/email?template=${template.id}#tpl-${template.id}`
                    }
                    aria-expanded={open}
                    aria-controls={`tpl-panel-${template.id}`}
                    className={cn(
                      "flex flex-wrap items-center justify-between gap-3 px-5 py-3 transition-colors",
                      open ? "bg-teal/8" : "hover:bg-secondary",
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        aria-hidden
                        className={cn(
                          "text-[11px] text-muted-foreground transition-transform",
                          open ? "rotate-90" : undefined,
                        )}
                      >
                        &#9654;
                      </span>
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

                  {open && selected ? (
                    <div
                      id={`tpl-panel-${template.id}`}
                      className="border-t border-teal/10 bg-cloud/50 px-5 py-4"
                    >
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
                        description={
                          TRIGGER_DESCRIPTIONS[selected.triggerKey] ?? "Transactional mail."
                        }
                        canEdit={manages}
                        embedded
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
