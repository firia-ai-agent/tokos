import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  clients,
  engagements,
  formAssignments,
  formSubmissions,
  formTemplates,
  portalMessages,
  resourceShares,
  resources,
} from "@/db/schema";
import { requireStaff } from "@/lib/tenancy";
import { allowedDoulaActions, staffStageLabel } from "@/lib/pipeline";
import { getFunnelFlags } from "@/lib/funnel";
import {
  clientSendOptions,
  familyMoneyRows,
  leadNotes,
  stageHistory,
  stageLogEvents,
  teamRoster,
} from "@/lib/queries";
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
import { FamilyMoneyCard } from "@/components/brand/family-money";
import { StageLogPanel } from "@/components/brand/stage-log";
import { StageSelect } from "@/components/brand/stage-select";
import { StageStepper } from "@/components/brand/stage-stepper";
import { LeadFieldsForm, LeadNotesFeed, LeadSummary } from "@/components/brand/lead-fields";
import { unreadFor } from "@/lib/messages";
import {
  EMERGENCY_CONTACT_SECTION_TITLE,
  emergencyContact,
  emergencyContactLine,
} from "@/lib/emergency-contact";
import {
  COMPOSER_COPY,
  messagesHref,
  staffThreadCardHint,
  staffThreadCardTitle,
  staffThreadEmpty,
  unreadBadgeCopy,
} from "@/lib/message-inbox";
import { familyMoney, MONEY_NOTICES } from "@/lib/family-money";
import { stageLog, stageStory } from "@/lib/stage-log";
import {
  confirmFitAction,
  markClientMessagesReadAction,
  sendContractAction,
  sendIntroAction,
  startCareAction,
  sendClientMessageAction,
  remindFormsAction,
} from "@/app/actions/doula";
import {
  assignFormsToClientAction,
  coCompleteFormAction,
  reopenFormAction,
} from "@/app/actions/forms";
import { shareResourcesWithClientAction } from "@/app/actions/resources";
import { PickHeading, PickList } from "@/components/brand/send-picker";
import { Input } from "@/components/ui/input";
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
  searchParams: Promise<{
    stageError?: string;
    formsSent?: string;
    formsError?: string;
    resourcesShared?: string;
    resourcesError?: string;
    money?: string;
  }>;
}) {
  const { id } = await params;
  // `money` is the notice a money action redirects back with (TOK-77): `?money=recorded`.
  const {
    stageError,
    formsSent,
    formsError,
    resourcesShared,
    resourcesError,
    money: moneyNotice,
  } = await searchParams;
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
  // Who moved this family and why (TOK-77) — the log used to select the raw event rows
  // and print a date and an arrow, which is an audit trail with the audit taken out.
  const events = await stageLogEvents(staff.organizationId, client.id);
  const ledger = await familyMoneyRows(staff.organizationId, client.id);
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

  // What is still sendable to this family: family-audience templates she has no open
  // copy of, and handouts not already on her shelf. Family is the page, so the pickers
  // below carry no family dropdown at all (TOK-50 / CRM-FIRST §2A).
  const sendable = await clientSendOptions(staff.organizationId, client.id, staff.userId);
  const emergency = emergencyContact({
    name: client.alternateContactName,
    phone: client.alternateContactPhone,
  });
  const familyName = client.preferredName ?? client.displayName;
  // One empty state for this family, shared with the inbox pane (TOK-56).
  const threadEmpty = staffThreadEmpty(familyName);
  const today = new Date();
  // Both halves of TOK-77 are decided in `@/lib/*` and only rendered here, so the money
  // verbs and the stage wording are testable without mounting the page.
  const money = familyMoney({
    clientId: client.id,
    contracts: ledger.contracts,
    invoices: ledger.invoices,
    allowedActions: actions,
    now: today,
  });
  const log = stageLog(events, { persona, now: today });
  const story = stageStory(log);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-heading text-3xl text-teal-ink">{client.displayName}</h2>
          <p className="text-sm text-muted-foreground">
            {client.email} · due {client.edd ?? "—"}
          </p>
          {/* Who to call at 3am, on the record rather than three clicks away (TOK-57).
              The family owns this field from her portal profile. */}
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            <span className="font-medium text-teal-ink/70">
              {EMERGENCY_CONTACT_SECTION_TITLE}:
            </span>{" "}
            <span className={emergency.reachable ? undefined : "text-coral"}>
              {emergencyContactLine({
                name: client.alternateContactName,
                phone: client.alternateContactPhone,
              })}
            </span>
          </p>
        </div>
        <Badge className="text-sm">{staffStageLabel(persona, funnel.stage)}</Badge>
      </div>

      {/* Anchors for the review board (TOK-52): a queue row lands on the section that
          clears it, not at the top of a long record. */}
      <Card id="care-team" className="scroll-mt-24">
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
          {/* The current stage story, above the fold beside the control that changes it
              (TOK-77): actor · why · when, read from the same log the history below
              renders, so the two can never name different moves. */}
          {story ? (
            <p className="text-[13px] font-semibold text-teal-ink">
              {story}
            </p>
          ) : null}
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

      <Card id="lead-details" className="scroll-mt-24">
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

      <Card id="notes" className="scroll-mt-24">
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <LeadNotesFeed clientId={client.id} notes={notes} action={appendLeadNoteAction} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Every row on this card ends in a verb (TOK-77). What it replaced printed the
            same three facts and offered nothing to press. */}
        <FamilyMoneyCard
          money={money}
          clientId={client.id}
          familyName={familyName}
          notice={MONEY_NOTICES[String(moneyNotice ?? "")] ?? null}
        />
        <Card>
          <CardHeader>
            <CardTitle>Stage log</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {/* Collapsed by default: the stepper and the story line above already answer
                "where are we" and "what moved last". This is the trail behind them. */}
            <StageLogPanel log={log} />
          </CardContent>
        </Card>
      </div>

      <Card id="forms" className="scroll-mt-24">
        <CardHeader className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Forms</CardTitle>
            <PhiNote className="mt-1" />
          </div>
          <form action={remindFormsAction.bind(null, client.id)}>
            <Button type="submit" size="sm" variant="outline">
              Email a reminder
            </Button>
          </form>
        </CardHeader>
        <CardContent className="space-y-4">
          {formsSent ? (
            <p className="rounded-lg bg-teal/10 px-3 py-2 text-[12.5px] font-semibold text-teal-ink ring-1 ring-teal/20">
              Sent {formsSent} form{formsSent === "1" ? "" : "s"} to {familyName}. They are in
              the portal now.
            </p>
          ) : null}
          {formsError ? (
            <p className="rounded-lg bg-coral/12 px-3 py-2 text-[12.5px] font-semibold text-coral">
              {formsError === "pick"
                ? "Tick at least one form first."
                : formsError === "staff_only"
                  ? "That one is a staff form — it stays on your side, not in the portal."
                  : `${familyName} already has those open.`}
            </p>
          ) : null}

          {/* Send a form: the family is the page, so this picks templates only. One
              button, however many are ticked (TOK-50 / CRM-FIRST §2A). */}
          <form
            action={assignFormsToClientAction}
            className="space-y-3 rounded-lg bg-cloud p-3.5 ring-1 ring-teal/12"
          >
            <input type="hidden" name="clientId" value={client.id} />
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <PickHeading>Send a form</PickHeading>
              <span className="text-[11.5px] text-muted-foreground">
                Family forms only — staff notes stay on your side
              </span>
            </div>
            <PickList
              name="templateIds"
              columns={2}
              items={sendable.formTemplates.map((template) => ({
                id: template.id,
                label: template.title,
                hint: `${template.schemaJson.fields.length} question${
                  template.schemaJson.fields.length === 1 ? "" : "s"
                }`,
              }))}
              emptyLabel={`${familyName} already has every family form in your library. Build another on Forms.`}
            />
            {sendable.formTemplates.length > 0 ? (
              <div className="flex flex-wrap items-end gap-2.5">
                <label className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Fills it in
                  <select
                    name="assigneeRole"
                    defaultValue="either"
                    className="mt-1 h-9 w-full rounded-md border border-teal/20 bg-card px-2.5 text-[13px] text-teal-ink focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/25"
                  >
                    <option value="either">Either of us</option>
                    <option value="client">Family</option>
                    <option value="doula">Me, on a visit</option>
                  </select>
                </label>
                <label className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
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
            ) : null}
          </form>

          {forms.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing sent yet. Tick a form above and send it.
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
          <CardTitle>Resources</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {resourcesShared ? (
            <p className="rounded-lg bg-teal/10 px-3 py-2 text-[12.5px] font-semibold text-teal-ink ring-1 ring-teal/20">
              Added {resourcesShared} handout{resourcesShared === "1" ? "" : "s"} to{" "}
              {familyName}&rsquo;s portal.
            </p>
          ) : null}
          {resourcesError ? (
            <p className="rounded-lg bg-coral/12 px-3 py-2 text-[12.5px] font-semibold text-coral">
              {resourcesError === "pick"
                ? "Tick at least one handout first."
                : `${familyName} already has those.`}
            </p>
          ) : null}

          {/* Share a handout: same shape as the form sender above. */}
          <form
            action={shareResourcesWithClientAction}
            className="space-y-3 rounded-lg bg-cloud p-3.5 ring-1 ring-teal/12"
          >
            <input type="hidden" name="clientId" value={client.id} />
            <PickHeading>Share a handout</PickHeading>
            <PickList
              name="resourceIds"
              columns={2}
              items={sendable.resources.map((resource) => ({
                id: resource.id,
                label: resource.title,
                hint: resource.kind,
              }))}
              emptyLabel={`${familyName} already has everything in your library. Write another on Resources.`}
            />
            {sendable.resources.length > 0 ? (
              <Button type="submit" size="sm">
                Add to their portal
              </Button>
            ) : null}
          </form>

          {shared.length === 0 ? (
            <p className="text-muted-foreground">
              Nothing on their shelf yet. Tick a handout above and add it.
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

      <Card id="portal-messages" className="scroll-mt-24">
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          {/* A conversation, named after the person in it (TOK-56, Vera). "Portal
              messages" is the table's name for these rows, not this card's — a doula
              reading Jordan's file is looking at her thread with Jordan. */}
          <div className="min-w-0">
            <CardTitle>{staffThreadCardTitle(familyName)}</CardTitle>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              {staffThreadCardHint(familyName)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {unreadFromClient > 0 ? (
              <Badge variant="secondary" className="bg-coral/12 text-coral">
                {unreadBadgeCopy(unreadFromClient)}
              </Badge>
            ) : null}
            {/* The record and the inbox are the same conversation; this is the door
                between them, so a doula reading a file can carry on in the inbox
                without losing the list (TOK-56). */}
            <Link
              href={messagesHref({ clientId: client.id })}
              className="rounded-lg bg-cloud px-2.5 py-1.5 text-[12.5px] font-semibold text-teal ring-1 ring-teal/20 transition hover:ring-teal/45"
            >
              Open in Messages
            </Link>
          </div>
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
            theirName={familyName}
            emptyTitle={threadEmpty.title}
            emptyBody={threadEmpty.body}
          />
          <MessageComposer
            action={sendClientMessageAction}
            hiddenFields={{ clientId: client.id }}
            placeholder={COMPOSER_COPY.staff.placeholder(familyName)}
            hint={COMPOSER_COPY.staff.hint(familyName)}
            submitLabel={COMPOSER_COPY.staff.submitLabel}
          />
        </CardContent>
      </Card>
    </div>
  );
}
