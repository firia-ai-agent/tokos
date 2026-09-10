import { format } from "date-fns";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { formAssignments, formSubmissions, formTemplates } from "@/db/schema";
import { requireClient } from "@/lib/tenancy";
import { resolveAssignedDoulaName } from "@/lib/assigned-doula";
import { completeFormAction } from "@/app/actions/client";
import { FormAnswers, FormFieldInputs, PhiNote } from "@/components/brand/forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/brand/states";
import { cn } from "@/lib/utils";

export default async function PortalFormsPage() {
  const session = await requireClient();
  const doula = await resolveAssignedDoulaName({
    organizationId: session.organizationId,
    clientId: session.clientId,
  });
  const db = getDb();
  const rows = await db
    .select({ assignment: formAssignments, template: formTemplates })
    .from(formAssignments)
    .innerJoin(formTemplates, eq(formTemplates.id, formAssignments.templateId))
    .where(
      and(
        eq(formAssignments.organizationId, session.organizationId),
        eq(formAssignments.clientId, session.clientId),
        // Defence in depth (TOK-50). The picker only offers family templates and the
        // assign actions refuse staff ones; this makes a bad row written by an older
        // build invisible here too, rather than handing a family "Doula's Birth Log".
        eq(formTemplates.audience, "family"),
      ),
    )
    .orderBy(desc(formAssignments.updatedAt));

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No forms yet"
        body={`${doula.name} will assign these when you are ready.`}
      />
    );
  }

  // Answers are read back so a family can see what they sent and pick up a form the
  // doula started with them on a visit.
  const submissions = await db
    .select()
    .from(formSubmissions)
    .where(
      and(
        eq(formSubmissions.organizationId, session.organizationId),
        inArray(
          formSubmissions.assignmentId,
          rows.map((row) => row.assignment.id),
        ),
      ),
    )
    .orderBy(desc(formSubmissions.submittedAt));

  const latest = new Map<string, (typeof submissions)[number]>();
  for (const submission of submissions) {
    if (!latest.has(submission.assignmentId)) latest.set(submission.assignmentId, submission);
  }

  const open = rows.filter((row) => row.assignment.status === "incomplete").length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-[28px] font-semibold tracking-[-0.02em] text-teal-ink">
            Forms
          </h1>
          <p className="mt-1.5 text-[14.5px] text-muted-foreground">
            {open === 0
              ? "All caught up — nothing waiting on you."
              : `${open} form${open === 1 ? "" : "s"} waiting on you.`}
          </p>
        </div>
        <PhiNote className="max-w-xs sm:text-right" />
      </header>

      <div className="space-y-4">
        {rows.map(({ assignment, template }) => {
          const submission = latest.get(assignment.id) ?? null;
          const isComplete = assignment.status === "complete";

          return (
            <article key={assignment.id} className="rounded-xl bg-card ring-1 ring-teal/15">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-teal/10 px-5 py-3.5">
                <div className="min-w-0">
                  <h2 className="font-heading text-lg text-teal-ink">{template.title}</h2>
                  <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                    {template.schemaJson.fields.length} question
                    {template.schemaJson.fields.length === 1 ? "" : "s"}
                    {assignment.dueAt ? ` · due ${format(assignment.dueAt, "MMM d")}` : ""}
                    {submission ? ` · saved ${format(submission.submittedAt, "MMM d")}` : ""}
                  </p>
                </div>
                <Badge
                  variant="secondary"
                  className={cn(
                    isComplete ? "bg-teal/12 text-teal-ink" : "bg-coral/12 text-coral",
                  )}
                >
                  {isComplete ? "Complete" : "Waiting on you"}
                </Badge>
              </div>

              {isComplete ? (
                <div className="space-y-3 px-5 py-4">
                  <FormAnswers schema={template.schemaJson} answers={submission?.answersJson} />
                  <p className="text-[12.5px] text-muted-foreground">
                    Want to change something? Message {doula.firstName} to have it reopened.
                  </p>
                </div>
              ) : (
                <form action={completeFormAction} className="space-y-4 px-5 py-4">
                  <input type="hidden" name="assignmentId" value={assignment.id} />
                  <FormFieldInputs
                    schema={template.schemaJson}
                    idPrefix={assignment.id}
                    defaults={submission?.answersJson}
                  />
                  <Button type="submit">Save answers</Button>
                </form>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
