import Link from "next/link";
import { format } from "date-fns";
import { requireStaff } from "@/lib/tenancy";
import { formsHub, listOrgClients } from "@/lib/queries";
import { audienceLabel, isStaffAudience } from "@/lib/form-audience";
import { isSensitiveField } from "@/lib/forms";
import {
  familiesWithOpenForms,
  groupAssignmentsByClient,
  groupCountLabel,
  isOverdue,
} from "@/lib/forms-by-client";
import {
  assignFormsToFamiliesAction,
  createFormTemplateAction,
  remindAssignmentAction,
  reopenFormAction,
} from "@/app/actions/forms";
import { FormAnswers, PhiNote, SensitiveBadge } from "@/components/brand/forms";
import { PickHeading, PickList } from "@/components/brand/send-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const NOTICES: Record<string, { tone: "teal" | "coral"; text: string }> = {
  template: { tone: "teal", text: "Template saved. Send it to a family below." },
  assignment: { tone: "teal", text: "Sent. It is in the family's portal now." },
  title: { tone: "coral", text: "A template needs a title." },
  fields: { tone: "coral", text: "Add at least one question — one per line." },
  assign: { tone: "coral", text: "Tick at least one form and one family." },
  duplicate: { tone: "coral", text: "They already have those forms open." },
  staff_only: {
    tone: "coral",
    text: "Staff forms stay on your side — they never go to a family portal.",
  },
};

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-teal/20 bg-card px-2.5 text-[13px] text-teal-ink focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/25";

export default async function DoulaFormsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; error?: string; sent?: string }>;
}) {
  const query = await searchParams;
  const staff = await requireStaff();
  const hub = await formsHub(staff.organizationId);
  const clients = await listOrgClients(staff.organizationId, staff.userId);
  const notice = NOTICES[query.error ?? ""] ?? NOTICES[query.created ?? ""];
  const sentCount = Number(query.sent ?? 0);

  // The in-flight board is one row per family, most-owed first (TOK-57). Answered work
  // stays reachable underneath her name, so nothing that was on the flat list is lost.
  const groups = groupAssignmentsByClient(hub.assignments);
  const openFamilies = familiesWithOpenForms(groups);
  const completedByClient = new Map<string, typeof hub.assignments>();
  for (const row of hub.assignments) {
    if (row.assignment.status !== "complete") continue;
    const rows = completedByClient.get(row.client.id) ?? [];
    rows.push(row);
    completedByClient.set(row.client.id, rows);
  }

  const stats = [
    { label: "Family forms", value: hub.familyTemplates.length, tone: "ink" as const },
    { label: "Open with families", value: hub.openCount, tone: "coral" as const },
    { label: "Complete", value: hub.completeCount, tone: "teal" as const },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="font-heading text-[28px] font-semibold leading-tight tracking-[-0.02em] text-teal-ink">
            Forms
          </h1>
          <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted-foreground">
            Build a template once, send it to as many families as you like, and finish it
            together on a visit. Nothing sends itself.
          </p>
        </div>
        <PhiNote className="max-w-xs text-right" />
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
          {notice.tone === "teal" && sentCount > 0
            ? ` ${sentCount} form${sentCount === 1 ? "" : "s"} went out.`
            : null}
        </p>
      ) : null}

      <section className="grid grid-cols-3 gap-3">
        {stats.map((stat) => (
          <article key={stat.label} className="rounded-xl bg-card p-4 ring-1 ring-teal/15">
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {stat.label}
            </p>
            <p
              className={cn(
                "mt-2 font-heading text-[26px] font-semibold leading-none tabular-nums",
                stat.tone === "coral" && stat.value > 0 ? "text-coral" : "text-teal-ink",
              )}
            >
              {stat.value}
            </p>
          </article>
        ))}
      </section>

      {/* Send to families (TOK-50 / CRM-FIRST §2B). One picker of forms, one picker of
          families, one button — instead of a Family dropdown and an Assign button
          repeated inside every template card. Only family-audience templates are
          selectable here; the staff shelf below has no portal CTA at all. */}
      <section className="rounded-xl bg-card ring-1 ring-teal/15">
        <div className="border-b border-teal/10 px-5 py-3.5">
          <h2 className="font-heading text-xl text-teal-ink">Send to families</h2>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            Tick the forms, tick who they are for, send once.
          </p>
        </div>
        {hub.familyTemplates.length === 0 || clients.length === 0 ? (
          <p className="px-5 py-8 text-sm text-muted-foreground">
            {hub.familyTemplates.length === 0
              ? "No family forms yet. Build one on the right and it shows up here."
              : "No assigned families yet — a family lands here once she books a consult with you."}
          </p>
        ) : (
          <form action={assignFormsToFamiliesAction} className="space-y-4 px-5 py-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <PickHeading>Forms</PickHeading>
                <PickList
                  name="templateIds"
                  items={hub.familyTemplates.map((template) => ({
                    id: template.id,
                    label: template.title,
                    hint: `${template.kind} · ${template.schemaJson.fields.length} question${
                      template.schemaJson.fields.length === 1 ? "" : "s"
                    }${
                      template.schemaJson.fields.filter(isSensitiveField).length > 0
                        ? " · sensitive"
                        : ""
                    }`,
                  }))}
                  emptyLabel="No family forms yet."
                />
              </div>
              <div className="space-y-2">
                <PickHeading>Families</PickHeading>
                <PickList
                  name="clientIds"
                  items={clients.map(({ client }) => ({
                    id: client.id,
                    label: client.displayName,
                    hint: client.edd ? `due ${client.edd}` : undefined,
                  }))}
                  emptyLabel="No assigned families yet."
                />
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-2.5 rounded-lg bg-cloud p-2.5 ring-1 ring-teal/10">
              <label className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Fills it in
                <select
                  name="assigneeRole"
                  defaultValue="either"
                  className={cn(SELECT_CLASS, "mt-1")}
                >
                  <option value="either">Either of us</option>
                  <option value="client">Family</option>
                  <option value="doula">Me, on a visit</option>
                </select>
              </label>
              <label className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Due
                <Input type="date" name="dueAt" className="mt-1 h-9 w-[10rem]" />
              </label>
              <label className="flex items-center gap-2 pb-2 text-[12.5px] text-teal-ink">
                <input type="checkbox" name="notify" defaultChecked className="size-3.5 accent-teal" />
                Email a reminder
              </label>
              <Button type="submit" size="sm">
                Send to family
              </Button>
            </div>
          </form>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
        <article className="rounded-xl bg-card ring-1 ring-teal/15">
          <div className="border-b border-teal/10 px-5 py-3.5">
            <h2 className="font-heading text-xl text-teal-ink">Templates</h2>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              What each form asks. Sensitive questions are marked.
            </p>
          </div>
          {hub.templates.length === 0 ? (
            <p className="px-5 py-8 text-sm text-muted-foreground">
              No templates yet. Build your first one on the right.
            </p>
          ) : (
            <ul className="divide-y divide-teal/10">
              {hub.templates.map((template) => {
                const sensitive = template.schemaJson.fields.filter(isSensitiveField).length;
                const staffOnly = isStaffAudience(template);
                return (
                  <li key={template.id} className="space-y-3 px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[14px] font-semibold text-teal-ink">
                          {template.title}
                        </p>
                        <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                          {template.kind} · {template.schemaJson.fields.length} question
                          {template.schemaJson.fields.length === 1 ? "" : "s"} · v
                          {template.version}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                        {/* A staff form is work the doula does; it has no send button
                            anywhere, and the chip says so rather than leaving her
                            hunting for one (TOK-50). */}
                        <Badge
                          variant="secondary"
                          className={
                            staffOnly ? "bg-teal-ink/10 text-teal-ink" : "bg-teal/10 text-teal-ink"
                          }
                        >
                          {audienceLabel(template.audience)}
                        </Badge>
                        {sensitive > 0 ? <SensitiveBadge /> : null}
                      </div>
                    </div>
                    <ul className="flex flex-wrap gap-1.5">
                      {template.schemaJson.fields.map((field) => (
                        <li
                          key={field.id}
                          className={cn(
                            "rounded-md px-2 py-0.5 text-[11.5px]",
                            isSensitiveField(field)
                              ? "bg-coral/10 font-medium text-coral"
                              : "bg-cloud text-muted-foreground ring-1 ring-teal/10",
                          )}
                        >
                          {field.label}
                        </li>
                      ))}
                    </ul>
                    {staffOnly ? (
                      <p className="text-[12.5px] text-muted-foreground">
                        Yours to fill in on a visit — never sent to a family portal.
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </article>

        <article className="rounded-xl bg-card ring-1 ring-teal/15">
          <div className="border-b border-teal/10 bg-teal-ink px-5 py-3.5">
            <h2 className="font-heading text-lg text-cloud">New template</h2>
            <p className="mt-0.5 text-[12px] text-cloud/65">
              One question per line: <code>Label | type | sensitive</code>
            </p>
          </div>
          <form action={createFormTemplateAction} className="space-y-3 px-5 py-4">
            <div className="space-y-1.5">
              <label htmlFor="template-title" className="text-[13px] font-medium text-teal-ink">
                Title
              </label>
              <Input id="template-title" name="title" required placeholder="Postpartum plan" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="template-kind" className="text-[13px] font-medium text-teal-ink">
                Kind
              </label>
              <select id="template-kind" name="kind" defaultValue="intake" className={SELECT_CLASS}>
                <option value="intake">Intake</option>
                <option value="expectations">Expectations</option>
                <option value="postpartum">Postpartum</option>
                <option value="logistics">Logistics</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="template-audience" className="text-[13px] font-medium text-teal-ink">
                Who fills it in
              </label>
              <select
                id="template-audience"
                name="audience"
                defaultValue="family"
                className={SELECT_CLASS}
              >
                <option value="family">A family — goes to their portal</option>
                <option value="staff">Me or my team — never leaves this side</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="template-fields" className="text-[13px] font-medium text-teal-ink">
                Questions
              </label>
              <Textarea
                id="template-fields"
                name="fields"
                rows={6}
                required
                defaultValue={
                  "What should we call you? | text\nWho is on your team at home? | textarea\nAnything you want kept private from email? | textarea | sensitive"
                }
              />
              <p className="text-[12px] text-muted-foreground">
                Types: <code>text</code>, <code>textarea</code>, <code>date</code>. Add{" "}
                <code>| sensitive</code> to lock an answer to the portal — wording that reads
                as health or notes is locked automatically.
              </p>
            </div>
            <Button type="submit">Save template</Button>
          </form>
        </article>
      </section>

      {/* In flight, by family (TOK-57). The founder works family-by-family, not
          form-by-form: "when you click on the client's name, it has a dropdown for all of
          the different assignments that are incomplete." Each family is one row that says
          how much she owes; open it and the forms are there with the same three actions
          that were on the flat list. Plain `<details>` — a disclosure needs no JavaScript,
          and several families can be open at once while a doula works down them. */}
      <section className="rounded-xl bg-card ring-1 ring-teal/15">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-teal/10 px-5 py-3.5">
          <div>
            <h2 className="font-heading text-xl text-teal-ink">In flight, by family</h2>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              Who is still holding a form. Open a name to see hers.
            </p>
          </div>
          <Badge
            variant="secondary"
            className={openFamilies > 0 ? "bg-coral/12 text-coral" : "bg-teal/10 text-teal-ink"}
          >
            {openFamilies > 0
              ? `${openFamilies} famil${openFamilies === 1 ? "y" : "ies"} waiting`
              : "All caught up"}
          </Badge>
        </div>
        {groups.length === 0 ? (
          <p className="px-5 py-8 text-sm text-muted-foreground">
            Nothing sent yet. Tick a form and a family above and send it.
          </p>
        ) : (
          <ul className="divide-y divide-teal/10">
            {groups.map((group) => {
              const answered = completedByClient.get(group.clientId) ?? [];
              const open = group.incomplete.length > 0;
              return (
                <li key={group.clientId}>
                  <details open={open} className="group">
                    <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-5 py-3.5 hover:bg-cloud/60">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          aria-hidden
                          className="text-[11px] text-muted-foreground transition-transform group-open:rotate-90"
                        >
                          &#9654;
                        </span>
                        <span className="truncate text-[14px] font-semibold text-teal-ink">
                          {group.clientName}
                        </span>
                        {group.overdueCount > 0 ? (
                          <Badge variant="secondary" className="bg-coral/12 text-coral">
                            {group.overdueCount} past due
                          </Badge>
                        ) : null}
                      </div>
                      <span
                        className={cn(
                          "text-[12.5px] font-medium",
                          open ? "text-coral" : "text-muted-foreground",
                        )}
                      >
                        {groupCountLabel(group)}
                        {group.completeCount > 0 ? (
                          <span className="ml-1.5 font-normal text-muted-foreground">
                            · {group.completeCount} answered
                          </span>
                        ) : null}
                      </span>
                    </summary>

                    <div className="space-y-2 bg-cloud/50 px-5 py-3">
                      {group.incomplete.map(({ assignment, template }) => (
                        <div
                          key={assignment.id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-card p-3 ring-1 ring-teal/10"
                        >
                          <div className="min-w-0">
                            <p className="text-[13.5px] font-semibold text-teal-ink">
                              {template.title}
                            </p>
                            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                              {assignment.assigneeRole === "doula"
                                ? "For a visit"
                                : assignment.assigneeRole === "client"
                                  ? "For the family"
                                  : "Either of us"}
                              {assignment.dueAt ? (
                                <span
                                  className={
                                    isOverdue(assignment) ? "font-medium text-coral" : undefined
                                  }
                                >
                                  {` · due ${format(assignment.dueAt, "MMM d")}`}
                                </span>
                              ) : null}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-wrap items-center gap-2">
                            <form action={remindAssignmentAction}>
                              <input type="hidden" name="assignmentId" value={assignment.id} />
                              <Button type="submit" size="sm" variant="outline">
                                Send reminder
                              </Button>
                            </form>
                            <Link
                              href={`/doula/clients/${group.clientId}#forms`}
                              className="rounded-md bg-coral/15 px-2.5 py-1 text-[12px] font-semibold text-coral hover:bg-coral/25"
                            >
                              Co-complete
                            </Link>
                          </div>
                        </div>
                      ))}

                      {group.incomplete.length === 0 ? (
                        <p className="text-[12.5px] text-muted-foreground">
                          {group.completeCount > 0
                            ? "Nothing outstanding — everything she was sent is answered."
                            : "Nothing sent to her yet."}
                        </p>
                      ) : null}

                      {answered.map(({ assignment, template, submission }) => (
                        <details
                          key={assignment.id}
                          className="rounded-lg bg-card p-3 ring-1 ring-teal/10"
                        >
                          <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3">
                            <span className="text-[13.5px] font-medium text-teal-ink">
                              {template.title}
                            </span>
                            <span className="flex items-center gap-2">
                              <span className="text-[12.5px] text-muted-foreground">
                                {submission
                                  ? `answered ${format(submission.submittedAt, "MMM d")}`
                                  : "answered"}
                              </span>
                              <Badge variant="secondary" className="bg-teal/12 text-teal-ink">
                                Complete
                              </Badge>
                            </span>
                          </summary>
                          <div className="mt-3 space-y-3">
                            {submission ? (
                              <FormAnswers
                                schema={template.schemaJson}
                                answers={submission.answersJson}
                              />
                            ) : null}
                            <form action={reopenFormAction}>
                              <input type="hidden" name="assignmentId" value={assignment.id} />
                              <Button type="submit" size="sm" variant="ghost">
                                Reopen
                              </Button>
                            </form>
                          </div>
                        </details>
                      ))}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
