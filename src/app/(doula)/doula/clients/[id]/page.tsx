import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  clients,
  contracts,
  engagements,
  formAssignments,
  formSubmissions,
  formTemplates,
  invoices,
  pipelineEvents,
  portalMessages,
  resourceShares,
  resources,
} from "@/db/schema";
import { requireStaff } from "@/lib/tenancy";
import { allowedDoulaActions, stageLabel } from "@/lib/pipeline";
import { getFunnelFlags } from "@/lib/funnel";
import { leadNotes, stageHistory, teamRoster } from "@/lib/queries";
import { canManageTeam, roleLabel } from "@/lib/team";
import { shellPersona } from "@/lib/shell-persona";
import { assignPrimaryDoulaAction } from "@/app/actions/team";
import {
  appendLeadNoteAction,
  logContactAction,
  saveLeadFieldsAction,
  setLeadOwnerAction,
  setReviewedAction,
  setStageAction,
} from "@/app/actions/leads";
import { StageSelect } from "@/components/brand/stage-select";
import { StageStepper } from "@/components/brand/stage-stepper";
import { LeadFieldsForm, LeadNotesFeed, LeadSummary } from "@/components/brand/lead-fields";
import { unreadFor } from "@/lib/messages";
import { formatCents } from "@/lib/money";
import {
  confirmFitAction,
  markClientMessagesReadAction,
  sendContractAction,
  sendIntroAction,
  startCareAction,
  sendClientMessageAction,
  remindFormsAction,
} from "@/app/actions/doula";
import { coCompleteFormAction, reopenFormAction } from "@/app/actions/forms";
import { FormAnswers, FormFieldInputs, PhiNote } from "@/components/brand/forms";
import { MessageComposer, MessageThread } from "@/components/brand/messages";
import { MarkThreadRead } from "@/components/brand/mark-thread-read";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ stageError?: string }>;
}) {
  const { id } = await params;
  const { stageError } = await searchParams;
  const staff = await requireStaff();
  const db = getDb();
  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, id), eq(clients.organizationId, staff.organizationId)))
    .limit(1);
  if (!client) notFound();

  const funnel = await getFunnelFlags(staff.organizationId, client.id);
  const actions = allowedDoulaActions(funnel.stage, funnel.flags);
  const persona = shellPersona(staff.membershipRole);
  const [entered, notes] = await Promise.all([
    stageHistory(staff.organizationId, client.id),
    leadNotes(staff.organizationId, client.id),
  ]);
  // One object the summary strip, the edit form and the CSV importer all describe the
  // same way — the field defs decide what is on it, not this page.
  const leadValues = {
    serviceType: client.serviceType,
    phone: client.phone,
    edd: client.edd,
    city: client.city,
    postalCode: client.postalCode,
    hospital: client.hospital,
    assignedProvider: client.assignedProvider,
    insurance: client.insurance,
    insuranceProvider: client.insuranceProvider,
    source: client.source,
    consultDate: client.consultDate,
    followUpDueOn: client.followUpDueOn,
    intakeRef: client.intakeRef,
    lastContactAt: client.lastContactAt,
  };
  // The engagement carries the match. Read org-scoped, like everything else on this page.
  const [engagement] = await db
    .select({ id: engagements.id, primaryDoulaUserId: engagements.primaryDoulaUserId })
    .from(engagements)
    .where(
      and(eq(engagements.organizationId, staff.organizationId), eq(engagements.clientId, client.id)),
    )
    .limit(1);
  const roster = await teamRoster(staff.organizationId);
  const manages = canManageTeam(staff.membershipRole);
  const primary = roster.find((member) => member.userId === engagement?.primaryDoulaUserId);
  const events = await db
    .select()
    .from(pipelineEvents)
    .where(
      and(eq(pipelineEvents.organizationId, staff.organizationId), eq(pipelineEvents.clientId, client.id)),
    )
    .orderBy(desc(pipelineEvents.at));
  const contractRows = await db
    .select()
    .from(contracts)
    .where(and(eq(contracts.organizationId, staff.organizationId), eq(contracts.clientId, client.id)))
    .orderBy(desc(contracts.createdAt));
  const invoiceRows = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.organizationId, staff.organizationId), eq(invoices.clientId, client.id)));
  const messages = await db
    .select()
    .from(portalMessages)
    .where(
      and(eq(portalMessages.organizationId, staff.organizationId), eq(portalMessages.clientId, client.id)),
    )
    .orderBy(asc(portalMessages.sentAt));
  const unreadFromClient = unreadFor(messages, "doula");
  const formRows = await db
    .select({ assignment: formAssignments, template: formTemplates })
    .from(formAssignments)
    .innerJoin(formTemplates, eq(formTemplates.id, formAssignments.templateId))
    .where(
      and(
        eq(formAssignments.organizationId, staff.organizationId),
        eq(formAssignments.clientId, client.id),
      ),
    )
    .orderBy(desc(formAssignments.updatedAt));
  // Latest answers per assignment: complete forms render them, open ones prefill from
  // them so a co-complete session starts where the family left off.
  const submissions = formRows.length
    ? await db
        .select()
        .from(formSubmissions)
        .where(
          and(
            eq(formSubmissions.organizationId, staff.organizationId),
            inArray(
              formSubmissions.assignmentId,
              formRows.map((row) => row.assignment.id),
            ),
          ),
        )
        .orderBy(desc(formSubmissions.submittedAt))
    : [];
  const latestSubmission = new Map<string, (typeof submissions)[number]>();
  for (const submission of submissions) {
    if (!latestSubmission.has(submission.assignmentId)) {
      latestSubmission.set(submission.assignmentId, submission);
    }
  }
  const forms = formRows.map((row) => ({
    ...row,
    submission: latestSubmission.get(row.assignment.id) ?? null,
  }));
  const shared = await db
    .select({ share: resourceShares, resource: resources })
    .from(resourceShares)
    .innerJoin(resources, eq(resources.id, resourceShares.resourceId))
    .where(
      and(
        eq(resourceShares.organizationId, staff.organizationId),
        eq(resourceShares.clientId, client.id),
      ),
    )
    .orderBy(desc(resourceShares.sharedAt));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-heading text-3xl text-teal-ink">{client.displayName}</h2>
          <p className="text-sm text-muted-foreground">
            {client.email} · due {client.edd ?? "—"}
          </p>
        </div>
        <Badge className="text-sm">{stageLabel(funnel.stage)}</Badge>
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Care team</CardTitle>
          <Link
            href="/doula/team"
            className="text-[12.5px] font-semibold text-coral hover:underline"
          >
            Roster →
          </Link>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Primary doula:{" "}
            {primary ? (
              <span className="font-semibold text-teal-ink">
                {primary.name}
                {primary.credentialsLabel ? ` · ${primary.credentialsLabel}` : ""} ·{" "}
                {roleLabel(primary.role)}
              </span>
            ) : (
              <span className="font-semibold text-coral">not matched yet</span>
            )}
          </p>
          {manages ? (
            <form action={assignPrimaryDoulaAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="clientId" value={client.id} />
              <input type="hidden" name="returnTo" value="client" />
              <label className="sr-only" htmlFor="primaryDoula">
                Primary doula
              </label>
              <select
                id="primaryDoula"
                name="doulaUserId"
                defaultValue={engagement?.primaryDoulaUserId ?? ""}
                className="h-9 w-[15rem] rounded-md border border-teal/20 bg-card px-2.5 text-[13px] text-teal-ink focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/25"
              >
                <option value="">No primary</option>
                {roster.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.name} · {roleLabel(member.role)}
                  </option>
                ))}
              </select>
              <Button type="submit" size="sm" variant="outline">
                Set primary
              </Button>
            </form>
          ) : (
            <p className="text-[12.5px] text-muted-foreground">
              Your founder or an admin changes the match.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {stageError ? (
            <p className="rounded-lg bg-coral/12 px-3 py-2 text-[12.5px] font-semibold text-coral">
              {stageError}
            </p>
          ) : null}
          {/* The dropdown is the control. `setStageAction` re-checks every rule, so this
              is a convenience, not the guard. */}
          <StageSelect clientId={client.id} current={funnel.stage} action={setStageAction} />
          <p className="text-sm text-muted-foreground">
            Fit confirmed: {funnel.flags.fitConfirmed ? "yes" : "no"} · Signed:{" "}
            {funnel.flags.agreementSigned ? "yes (intent)" : "no"} · Payment:{" "}
            {funnel.flags.paymentCleared ? "cleared" : "due"}
          </p>
          {/* Secondary: the actions that do real work — send an email, cut a contract —
              rather than only nudging the chip forward. */}
          <div className="flex flex-wrap gap-2">
            {actions.includes("send_intro") ? (
              <form action={sendIntroAction.bind(null, client.id)}>
                <Button type="submit" size="sm" variant="outline">
                  Send intro email
                </Button>
              </form>
            ) : null}
            {actions.includes("confirm_fit") ? (
              <form action={confirmFitAction.bind(null, client.id)}>
                <Button type="submit" size="sm" variant="outline">
                  Confirm fit
                </Button>
              </form>
            ) : null}
            {actions.includes("send_contract") ? (
              <form action={sendContractAction.bind(null, client.id)}>
                <Button type="submit" size="sm" variant="secondary">
                  Send contract
                </Button>
              </form>
            ) : null}
            {actions.includes("start_care") ? (
              <form action={startCareAction.bind(null, client.id)}>
                <Button type="submit" size="sm" variant="outline">
                  Start active care
                </Button>
              </form>
            ) : null}
            <form action={logContactAction} className="flex items-center gap-2">
              <input type="hidden" name="clientId" value={client.id} />
              <Button type="submit" size="sm" variant="ghost">
                Log contact
              </Button>
            </form>
          </div>
          <StageStepper current={funnel.stage} entered={entered} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Lead details</CardTitle>
          {persona === "agency" ? (
            <div className="flex flex-wrap items-center gap-2">
              <form action={setLeadOwnerAction} className="flex items-center gap-2">
                <input type="hidden" name="clientId" value={client.id} />
                <label className="sr-only" htmlFor="ownerUserId">
                  Owner
                </label>
                <select
                  id="ownerUserId"
                  name="ownerUserId"
                  defaultValue={client.ownerUserId ?? ""}
                  className="h-8 rounded-md border border-teal/20 bg-card px-2 text-[12.5px] text-teal-ink focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/25"
                >
                  <option value="">No owner</option>
                  {roster.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.name}
                    </option>
                  ))}
                </select>
                <Button type="submit" size="sm" variant="ghost">
                  Set owner
                </Button>
              </form>
              <form action={setReviewedAction}>
                <input type="hidden" name="clientId" value={client.id} />
                <input type="hidden" name="reviewed" value={client.reviewed ? "no" : "yes"} />
                <Button type="submit" size="sm" variant={client.reviewed ? "ghost" : "outline"}>
                  {client.reviewed ? "Reviewed ✓" : "Mark reviewed"}
                </Button>
              </form>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-5">
          <LeadSummary values={leadValues} persona={persona} />
          <LeadFieldsForm
            clientId={client.id}
            persona={persona}
            values={leadValues}
            action={saveLeadFieldsAction}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <LeadNotesFeed clientId={client.id} notes={notes} action={appendLeadNoteAction} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Contracts & invoices</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {contractRows.length === 0 ? <p>No contract sent yet.</p> : null}
            {contractRows.map((contract) => (
              <p key={contract.id}>
                {contract.packageLabel} · {contract.status} ·{" "}
                {formatCents(contract.amountCents)}
              </p>
            ))}
            {invoiceRows.map((invoice) => (
              <p key={invoice.id}>
                {invoice.number} · {invoice.status} · {formatCents(invoice.amountCents)}
              </p>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Stage log</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {/* The stepper above is the answer to "where are we"; this stays as the audit
                trail behind it, in staff labels rather than raw codes. */}
            {events.length === 0 ? <p className="text-muted-foreground">No moves yet.</p> : null}
            {events.map((event) => (
              <p key={event.id} className="text-muted-foreground">
                {format(event.at, "MMM d")} · {event.fromStage ? stageLabel(event.fromStage) : "—"}{" "}
                → <span className="font-medium text-teal-ink">{stageLabel(event.toStage)}</span>
              </p>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card id="forms" className="scroll-mt-24">
        <CardHeader className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Forms (co-complete)</CardTitle>
            <PhiNote className="mt-1" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/doula/forms"
              className="rounded-md bg-teal/12 px-2.5 py-1 text-[12px] font-semibold text-teal-ink hover:bg-teal/20"
            >
              Assign another
            </Link>
            <form action={remindFormsAction.bind(null, client.id)}>
              <Button type="submit" size="sm" variant="outline">
                Remind by email
              </Button>
            </form>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {forms.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No forms assigned yet. Pick a template on{" "}
              <Link href="/doula/forms" className="font-semibold text-teal hover:underline">
                Forms
              </Link>
              .
            </p>
          ) : null}
          {forms.map(({ assignment, template, submission }) => (
            <div key={assignment.id} className="rounded-lg border p-3.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-teal-ink">{template.title}</p>
                  <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                    {assignment.assigneeRole === "doula"
                      ? "For a visit"
                      : assignment.assigneeRole === "client"
                        ? "For the family"
                        : "Either of us"}
                    {submission
                      ? ` · last saved by ${
                          submission.submittedByUserId === staff.userId ? "you" : "the family"
                        }`
                      : ""}
                  </p>
                </div>
                <Badge
                  variant="secondary"
                  className={
                    assignment.status === "complete"
                      ? "bg-teal/12 text-teal-ink"
                      : "bg-coral/12 text-coral"
                  }
                >
                  {assignment.status === "complete" ? "Complete" : "Incomplete"}
                </Badge>
              </div>

              {assignment.status === "complete" ? (
                <div className="mt-3 space-y-3">
                  <FormAnswers schema={template.schemaJson} answers={submission?.answersJson} />
                  <form action={reopenFormAction}>
                    <input type="hidden" name="assignmentId" value={assignment.id} />
                    <Button type="submit" size="sm" variant="ghost">
                      Reopen for edits
                    </Button>
                  </form>
                </div>
              ) : (
                // Prefilled from the last save, so sitting down together picks up where
                // the family left off instead of starting from a blank card.
                <form action={coCompleteFormAction} className="mt-3 space-y-4">
                  <input type="hidden" name="assignmentId" value={assignment.id} />
                  <FormFieldInputs
                    schema={template.schemaJson}
                    idPrefix={assignment.id}
                    defaults={submission?.answersJson}
                  />
                  <Button type="submit" size="sm" variant="outline">
                    Save with client
                  </Button>
                </form>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Resources shared</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {shared.length === 0 ? (
            <p className="text-muted-foreground">
              Nothing shared yet. Send a handout from{" "}
              <Link href="/doula/resources" className="font-semibold text-teal hover:underline">
                Resources
              </Link>
              .
            </p>
          ) : (
            shared.map(({ share, resource }) => (
              <p key={share.id} className="flex flex-wrap items-center gap-2">
                {resource.title}
                <Badge
                  variant="secondary"
                  className={
                    share.completedAt ? "bg-teal/12 text-teal-ink" : "bg-coral/12 text-coral"
                  }
                >
                  {share.completedAt ? "Read" : "Unread"}
                </Badge>
              </p>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Portal messages</CardTitle>
          {unreadFromClient > 0 ? (
            <Badge variant="secondary" className="bg-coral/12 text-coral">
              {unreadFromClient} unread
            </Badge>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Same thread the family sees at /portal/messages, mirrored. Opening the record
              marks what they wrote as read. */}
          <MarkThreadRead
            unread={unreadFromClient}
            action={markClientMessagesReadAction.bind(null, client.id)}
          />
          <MessageThread
            messages={messages}
            viewer="doula"
            theirName={client.preferredName ?? client.displayName}
            emptyTitle="No messages yet"
            emptyBody={`Nothing from ${client.preferredName ?? client.displayName} yet. Write the first note and it lands in their portal.`}
          />
          <MessageComposer
            action={sendClientMessageAction}
            hiddenFields={{ clientId: client.id }}
            placeholder="Write to this family…"
            hint="Lands in their portal. No SMS in this milestone."
          />
        </CardContent>
      </Card>
    </div>
  );
}
