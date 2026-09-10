import { and, asc, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { addDays, differenceInCalendarWeeks, format, startOfMonth, subMonths } from "date-fns";
import { getDb } from "@/db";
import {
  assignments,
  calendarEvents,
  clientAiNotes,
  clients,
  contracts,
  emailTemplateVersions,
  emailTemplates,
  engagements,
  formAssignments,
  formSubmissions,
  formTemplates,
  invites,
  invoices,
  memberships,
  organizations,
  pipelineEvents,
  pipelineStages,
  portalMessages,
  resourceShares,
  resources,
  users,
} from "@/db/schema";
import { clientChrome } from "@/lib/client-brand";

import { formatCents } from "@/lib/money";
import { isOpenLeadStage, migrateStage, type PipelineStageName } from "@/lib/pipeline";
import { homeCaseloadHint, type ShellPersona } from "@/lib/shell-persona";
import { familyTemplates, staffTemplates } from "@/lib/form-audience";
import {
  needsAttentionRows,
  type NeedsAttentionInput,
  type NeedsAttentionRow,
} from "@/lib/needs-attention";
import { shellNotifyItems, type ShellNotifyItem } from "@/lib/home-queues";

export type HomeKpi = {
  label: string;
  value: string;
  hint: string;
  tone: "teal" | "coral" | "ink";
};

export type HomeTimelineItem = {
  id: string;
  name: string;
  edd: string;
  eddLabel: string;
  weeksLabel: string;
  stage: string;
  href: string;
  /** Raw `clients.service_type`; the card words it through `serviceTypeLabel`. */
  serviceType: string | null;
};

/**
 * One line of money that is actually moving: an invoice nobody has paid, an agreement
 * nobody has signed. Home's right column used to hold six $0 bars; this is what belongs
 * in that space while the ledger is young (TOK-52 density).
 */
export type HomeMoneyRow = {
  id: string;
  name: string;
  /** "Invoice open" / "Agreement unsigned". */
  kind: string;
  /** "$900" — cents formatted, trailing ".00" dropped. */
  amount: string;
  detail: string;
  href: string;
};

/** What one family owes, has waiting for signature, and has already paid. */
export type ClientLedger = {
  outstandingCents: number;
  unsignedCents: number;
  clearedCents: number;
};

export type HomeMonthBar = {
  key: string;
  label: string;
  cents: number;
  display: string;
};

/** Read a joined pipeline row as a canonical stage, legacy values and all (TOK-49). */
function canonicalStage(row: {
  stage: string | null;
  fitConfirmedAt?: Date | null;
}): PipelineStageName {
  return migrateStage(row.stage, { fitConfirmed: Boolean(row.fitConfirmedAt) });
}

/**
 * Per-family money, from invoice and contract rows already in memory.
 *
 * Open invoices, sent-and-unsigned agreements, cleared payments — the three numbers a
 * dense card may show. Voided agreements are not money waiting on anyone.
 */
export function clientLedgers(
  invoiceRows: readonly (typeof invoices.$inferSelect)[],
  contractRows: readonly (typeof contracts.$inferSelect)[],
): Record<string, ClientLedger> {
  const ledgers: Record<string, ClientLedger> = {};
  const bump = (clientId: string, key: keyof ClientLedger, cents: number) => {
    const row = (ledgers[clientId] ??= {
      outstandingCents: 0,
      unsignedCents: 0,
      clearedCents: 0,
    });
    row[key] += cents;
  };
  for (const invoice of invoiceRows) {
    if (invoice.status === "open") bump(invoice.clientId, "outstandingCents", invoice.amountCents);
    if (invoice.status === "paid") bump(invoice.clientId, "clearedCents", invoice.amountCents);
  }
  for (const contract of contractRows) {
    if (contract.status === "voided" || contract.signedAt) continue;
    bump(contract.clientId, "unsignedCents", contract.amountCents);
  }
  return ledgers;
}

/**
 * Home for one staff member. `persona` only decides wording — an agency reads its funnel,
 * a doula reads her families (TOK-49 soft fold) — never which rows come back, so the two
 * personas cannot disagree about the numbers underneath.
 */
export async function revenueHome(
  organizationId: string,
  doulaUserId: string,
  persona: ShellPersona = "agency",
) {
  const db = getDb();
  const myClients = await db
    .select({
      client: clients,
      stage: pipelineStages.stage,
      fitConfirmedAt: pipelineStages.fitConfirmedAt,
    })
    .from(clients)
    .innerJoin(pipelineStages, eq(pipelineStages.clientId, clients.id))
    .innerJoin(assignments, eq(assignments.clientId, clients.id))
    .where(
      and(
        eq(clients.organizationId, organizationId),
        eq(assignments.userId, doulaUserId),
        eq(assignments.status, "active"),
      ),
    );

  const clientIds = myClients.map((row) => row.client.id);
  const allInvoices = await db
    .select()
    .from(invoices)
    .where(eq(invoices.organizationId, organizationId));
  const myInvoices = allInvoices.filter((invoice) => clientIds.includes(invoice.clientId));

  const outstandingInvoices = myInvoices.filter((invoice) => invoice.status === "open");
  const outstanding = outstandingInvoices.reduce((sum, invoice) => sum + invoice.amountCents, 0);
  const paidInvoices = myInvoices.filter((invoice) => invoice.status === "paid");
  const cleared = paidInvoices.reduce((sum, invoice) => sum + invoice.amountCents, 0);

  const monthStart = startOfMonth(new Date());
  const clearedThisMonth = paidInvoices
    .filter((invoice) => invoice.paidAt && invoice.paidAt >= monthStart)
    .reduce((sum, invoice) => sum + invoice.amountCents, 0);

  const allContracts = await db
    .select()
    .from(contracts)
    .where(eq(contracts.organizationId, organizationId));
  const myContracts = allContracts.filter((contract) => clientIds.includes(contract.clientId));
  const unsignedContracts = myContracts.filter(
    (contract) => contract.status !== "voided" && !contract.signedAt,
  );
  const pipelineCents = unsignedContracts.reduce((sum, contract) => sum + contract.amountCents, 0);

  const today = new Date();
  const windowEnd = addDays(today, 30);
  const birthsSoon = myClients.filter((row) => {
    if (!row.client.edd) return false;
    const edd = new Date(`${row.client.edd}T12:00:00`);
    return edd >= today && edd <= windowEnd;
  });

  const activeCare = myClients.filter((row) => canonicalStage(row) === "active_care");
  // Still in the funnel: captured, not yet complete. One helper rather than a list of
  // stage strings that has to be found again every time the model grows (TOK-49).
  const leadOrFit = myClients.filter((row) => isOpenLeadStage(canonicalStage(row)));

  const monthBars: HomeMonthBar[] = [];
  for (let i = 5; i >= 0; i -= 1) {
    const cursor = subMonths(monthStart, i);
    const next = startOfMonth(addDays(startOfMonth(cursor), 32));
    const cents = paidInvoices
      .filter((invoice) => {
        if (!invoice.paidAt) return false;
        return invoice.paidAt >= cursor && invoice.paidAt < next;
      })
      .reduce((sum, invoice) => sum + invoice.amountCents, 0);
    monthBars.push({
      key: format(cursor, "yyyy-MM"),
      label: format(cursor, "MMM"),
      cents,
      display: cents === 0 ? "$0" : formatCents(cents).replace(/\.00$/, ""),
    });
  }

  const timeline: HomeTimelineItem[] = myClients
    .filter((row) => Boolean(row.client.edd))
    .map((row) => {
      const eddDate = new Date(`${row.client.edd}T12:00:00`);
      const weeks = differenceInCalendarWeeks(eddDate, today);
      const weeksLabel =
        weeks === 0
          ? "This week"
          : weeks > 0
            ? `${weeks} wk${weeks === 1 ? "" : "s"}`
            : `${Math.abs(weeks)} wk${Math.abs(weeks) === 1 ? "" : "s"} past`;
      return {
        id: row.client.id,
        name: row.client.displayName,
        edd: row.client.edd!,
        eddLabel: format(eddDate, "MMM d"),
        weeksLabel,
        stage: canonicalStage(row),
        href: `/doula/clients/${row.client.id}`,
        serviceType: row.client.serviceType,
      };
    })
    .sort((a, b) => a.edd.localeCompare(b.edd));

  const revenueValue = clearedThisMonth > 0 ? clearedThisMonth : cleared;
  const revenueHint =
    clearedThisMonth > 0
      ? `${format(monthStart, "MMMM")} cleared`
      : cleared > 0
        ? "All-time cleared"
        : "No cleared invoices yet";

  const kpis: HomeKpi[] = [
    {
      label: `Revenue · ${format(monthStart, "MMM")}`,
      value: formatCents(revenueValue),
      hint: revenueHint,
      tone: "teal",
    },
    {
      label: "Outstanding invoices",
      value: formatCents(outstanding),
      hint:
        outstandingInvoices.length === 0
          ? "None open"
          : `${outstandingInvoices.length} open`,
      tone: outstanding > 0 ? "coral" : "ink",
    },
    {
      label: "Unsigned agreements",
      value: formatCents(pipelineCents),
      hint:
        unsignedContracts.length === 0
          ? "None waiting"
          : `${unsignedContracts.length} waiting`,
      tone: pipelineCents > 0 ? "coral" : "ink",
    },
    {
      label: "Active clients",
      value: String(myClients.length),
      hint: homeCaseloadHint(persona, {
        inCare: activeCare.length,
        openLeads: leadOrFit.length,
      }),
      tone: "teal",
    },
    {
      label: "Births · next 30 days",
      value: String(birthsSoon.length),
      hint: birthsSoon.length === 0 ? "None on the board" : "By due date",
      tone: birthsSoon.length > 0 ? "coral" : "ink",
    },
  ];

  // Money per family, so a Home card can say "$900 open" without every page re-deriving
  // it from the invoice list (TOK-52 density). Built from the rows already in memory, and
  // org-wide on purpose: what a family owes is a fact about her, not about who is looking,
  // and Needs attention reaches families this staff member is not assigned to.
  const ledgerByClient = clientLedgers(allInvoices, allContracts);

  const clientName = (id: string) =>
    myClients.find((row) => row.client.id === id)?.client.displayName ?? "Family";

  const money = (cents: number) => formatCents(cents).replace(/\.00$/, "");
  const moneyInMotion: HomeMoneyRow[] = [
    ...outstandingInvoices.map((invoice) => ({
      id: `invoice-${invoice.id}`,
      name: clientName(invoice.clientId),
      kind: "Invoice open",
      amount: money(invoice.amountCents),
      detail: invoice.number ?? "Unnumbered",
      href: "/doula/invoices",
    })),
    ...unsignedContracts.map((contract) => ({
      id: `contract-${contract.id}`,
      name: clientName(contract.clientId),
      kind: "Agreement unsigned",
      amount: money(contract.amountCents),
      detail: contract.packageLabel,
      href: `/doula/clients/${contract.clientId}#money`,
    })),
  ];

  return {
    clients: myClients,
    kpis,
    monthBars,
    timeline,
    ledgerByClient,
    moneyInMotion,
    clearedTotal: cleared,
    outstandingTotal: outstanding,
  };
}

export async function clientChecklist(organizationId: string, clientId: string) {
  const db = getDb();
  // The family's checklist counts the family's forms. A staff template assigned against
  // this client — a visit note, the Birth Log — is never a chore she owes (TOK-50).
  const [formsIncomplete] = await db
    .select({ n: count() })
    .from(formAssignments)
    .innerJoin(formTemplates, eq(formTemplates.id, formAssignments.templateId))
    .where(
      and(
        eq(formAssignments.organizationId, organizationId),
        eq(formAssignments.clientId, clientId),
        eq(formAssignments.status, "incomplete"),
        eq(formTemplates.audience, "family"),
      ),
    );
  const [openInvoices] = await db
    .select({ n: count() })
    .from(invoices)
    .where(
      and(
        eq(invoices.organizationId, organizationId),
        eq(invoices.clientId, clientId),
        eq(invoices.status, "open"),
      ),
    );
  const [unsigned] = await db
    .select({ n: count() })
    .from(contracts)
    .where(
      and(
        eq(contracts.organizationId, organizationId),
        eq(contracts.clientId, clientId),
        eq(contracts.status, "sent"),
      ),
    );
  const [unread] = await db
    .select({ n: count() })
    .from(portalMessages)
    .where(
      and(
        eq(portalMessages.organizationId, organizationId),
        eq(portalMessages.clientId, clientId),
        eq(portalMessages.direction, "outbound"),
        sql`${portalMessages.readAt} is null`,
      ),
    );
  const [resourcesOpen] = await db
    .select({ n: count() })
    .from(resourceShares)
    .where(
      and(
        eq(resourceShares.organizationId, organizationId),
        eq(resourceShares.clientId, clientId),
        sql`${resourceShares.completedAt} is null`,
      ),
    );
  const upcoming = await db
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.organizationId, organizationId),
        eq(calendarEvents.clientId, clientId),
        gte(calendarEvents.startsAt, new Date()),
        eq(calendarEvents.status, "scheduled"),
      ),
    );

  return {
    incompleteForms: Number(formsIncomplete?.n ?? 0),
    openInvoices: Number(openInvoices?.n ?? 0),
    unsignedContracts: Number(unsigned?.n ?? 0),
    unreadMessages: Number(unread?.n ?? 0),
    openResources: Number(resourcesOpen?.n ?? 0),
    upcomingConsults: upcoming.length,
  };
}

/**
 * The two facts the resource gate turns on (TOK-39 E2): has this family signed, and has
 * money cleared. Read as raw status lists rather than booleans so `resourceGate` can
 * also tell whose turn it is — "ready to sign" and "invoice open" are different waits.
 * Org-scoped on both reads; a client session never reaches another tenant's rows.
 */
export async function clientAgreementStatuses(organizationId: string, clientId: string) {
  const db = getDb();
  const [contractRows, invoiceRows] = await Promise.all([
    db
      .select({ status: contracts.status })
      .from(contracts)
      .where(
        and(eq(contracts.organizationId, organizationId), eq(contracts.clientId, clientId)),
      ),
    db
      .select({ status: invoices.status })
      .from(invoices)
      .where(
        and(eq(invoices.organizationId, organizationId), eq(invoices.clientId, clientId)),
      ),
  ]);
  return {
    contractStatuses: contractRows.map((row) => row.status),
    invoiceStatuses: invoiceRows.map((row) => row.status),
  };
}

export async function listOrgClients(organizationId: string, doulaUserId: string) {
  const db = getDb();
  return db
    .select({
      client: clients,
      stage: pipelineStages.stage,
      fitConfirmedAt: pipelineStages.fitConfirmedAt,
    })
    .from(clients)
    .innerJoin(pipelineStages, eq(pipelineStages.clientId, clients.id))
    .innerJoin(assignments, eq(assignments.clientId, clients.id))
    .where(
      and(
        eq(clients.organizationId, organizationId),
        eq(assignments.userId, doulaUserId),
        eq(assignments.status, "active"),
      ),
    );
}

/**
 * The agency board (TOK-34 D7). `listOrgClients` is assignment-scoped, which is right
 * for a doula and wrong for an owner: the assignment join silently hides every family
 * nobody has been put on yet, so the one list an agency most needs — who is waiting for
 * a doula — is the one it cannot render. This reads the whole org instead, and leaves
 * the assignment join out entirely so a family appears exactly once whether she has no
 * doula, one, or a primary plus a backup.
 */
export async function listAgencyClients(organizationId: string) {
  const db = getDb();
  const rows = await db
    .select({
      client: clients,
      stage: pipelineStages.stage,
      fitConfirmedAt: pipelineStages.fitConfirmedAt,
    })
    .from(clients)
    .leftJoin(pipelineStages, eq(pipelineStages.clientId, clients.id))
    .where(eq(clients.organizationId, organizationId))
    .orderBy(asc(clients.displayName));
  // A client row without a pipeline row is a data accident, not a new stage — read it as
  // the first stage rather than rendering an empty badge.
  return rows.map((row) => ({ ...row, stage: canonicalStage(row) }));
}

/**
 * Everything `/doula/forms` renders: the org's templates, every assignment with its
 * template and family, and the latest submission per assignment so a complete form can
 * show what was answered. Reads are org-scoped; the answers never leave this process
 * except into the portal-authenticated page.
 */
export async function formsHub(organizationId: string) {
  const db = getDb();
  const templates = await db
    .select()
    .from(formTemplates)
    .where(eq(formTemplates.organizationId, organizationId))
    .orderBy(asc(formTemplates.title));

  const rows = await db
    .select({ assignment: formAssignments, template: formTemplates, client: clients })
    .from(formAssignments)
    .innerJoin(formTemplates, eq(formTemplates.id, formAssignments.templateId))
    .innerJoin(clients, eq(clients.id, formAssignments.clientId))
    .where(eq(formAssignments.organizationId, organizationId))
    .orderBy(desc(formAssignments.updatedAt));

  const submissions = await db
    .select()
    .from(formSubmissions)
    .where(eq(formSubmissions.organizationId, organizationId))
    .orderBy(desc(formSubmissions.submittedAt));

  // Ordered newest-first above, so the first hit per assignment is the latest one.
  const latest = new Map<string, (typeof submissions)[number]>();
  for (const submission of submissions) {
    if (!latest.has(submission.assignmentId)) latest.set(submission.assignmentId, submission);
  }

  const assignmentsWithAnswers = rows.map((row) => ({
    ...row,
    submission: latest.get(row.assignment.id) ?? null,
  }));

  return {
    templates,
    // Split once here so no page has to remember the rule: only `family` may be offered
    // a "Send to families" button, and staff templates still get a shelf of their own
    // rather than disappearing from the library that owns them (TOK-50).
    familyTemplates: familyTemplates(templates),
    staffTemplates: staffTemplates(templates),
    assignments: assignmentsWithAnswers,
    openCount: rows.filter((row) => row.assignment.status === "incomplete").length,
    completeCount: rows.filter((row) => row.assignment.status === "complete").length,
  };
}

/**
 * What `/doula/clients/[id]` can still send this family: family-audience templates she
 * has no open copy of, and handouts not already on her shelf. Sending from the record
 * means the family is already chosen, so the page needs the candidates and nothing else
 * (TOK-50 / CRM-FIRST §2A).
 */
export async function clientSendOptions(organizationId: string, clientId: string) {
  const db = getDb();
  const [templates, library, openAssignments, existingShares] = await Promise.all([
    db
      .select()
      .from(formTemplates)
      .where(eq(formTemplates.organizationId, organizationId))
      .orderBy(asc(formTemplates.title)),
    db
      .select()
      .from(resources)
      .where(eq(resources.organizationId, organizationId))
      .orderBy(asc(resources.title)),
    db
      .select({ templateId: formAssignments.templateId })
      .from(formAssignments)
      .where(
        and(
          eq(formAssignments.organizationId, organizationId),
          eq(formAssignments.clientId, clientId),
          eq(formAssignments.status, "incomplete"),
        ),
      ),
    db
      .select({ resourceId: resourceShares.resourceId })
      .from(resourceShares)
      .where(
        and(
          eq(resourceShares.organizationId, organizationId),
          eq(resourceShares.clientId, clientId),
        ),
      ),
  ]);

  const openTemplateIds = new Set(openAssignments.map((row) => row.templateId));
  const sharedResourceIds = new Set(existingShares.map((row) => row.resourceId));

  return {
    // Staff templates never reach this list — the family portal is the only destination
    // this picker has.
    formTemplates: familyTemplates(templates).filter(
      (template) => !openTemplateIds.has(template.id),
    ),
    resources: library.filter((resource) => !sharedResourceIds.has(resource.id)),
  };
}

/** Everything `/doula/resources` renders: the org library plus who has each item. */
export async function resourcesHub(organizationId: string) {
  const db = getDb();
  const library = await db
    .select()
    .from(resources)
    .where(eq(resources.organizationId, organizationId))
    .orderBy(asc(resources.title));

  const shares = await db
    .select({ share: resourceShares, resource: resources, client: clients })
    .from(resourceShares)
    .innerJoin(resources, eq(resources.id, resourceShares.resourceId))
    .innerJoin(clients, eq(clients.id, resourceShares.clientId))
    .where(eq(resourceShares.organizationId, organizationId))
    .orderBy(desc(resourceShares.sharedAt));

  return {
    library,
    shares,
    readCount: shares.filter((row) => row.share.completedAt).length,
  };
}

/**
 * The bell (TOK-53).
 *
 * This used to hand-build a flat alert list — one row per unsigned contract, one per open
 * invoice, one per open stage — and Jordan Rivera filled three of the four slots while
 * Avery Kim filled the fourth. Now it asks the same question Home and the review board
 * ask, of the same rules, and gets back one row per family with her reasons attached.
 *
 * Scope follows the reader: an agency owner sees the practice, an assigned doula sees her
 * own families (TOK-34). The count is families waiting, not findings — the number over
 * the bell should answer "how many people need me", and the issues are listed under each
 * name where they can be read.
 */
export async function shellAttention(
  organizationId: string,
  opts: { doulaUserId?: string } = {},
  today: Date = new Date(),
): Promise<{ count: number; items: ShellNotifyItem[] }> {
  const rows = await needsAttentionQueue(organizationId, opts, today);
  return { count: rows.length, items: shellNotifyItems(rows) };
}

/**
 * The agency roster: every membership in the org with the person behind it, founders
 * first, plus how many families each doula is primary on. Org-scoped by the join, so a
 * roster never reaches across tenants.
 */
export async function teamRoster(organizationId: string) {
  const db = getDb();
  const rows = await db
    .select({
      membershipId: memberships.id,
      role: memberships.role,
      joinedAt: memberships.createdAt,
      userId: users.id,
      name: users.name,
      email: users.email,
      credentialsLabel: users.credentialsLabel,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.organizationId, organizationId))
    .orderBy(asc(memberships.createdAt));

  const matched = await db
    .select({ userId: engagements.primaryDoulaUserId, n: count() })
    .from(engagements)
    .where(eq(engagements.organizationId, organizationId))
    .groupBy(engagements.primaryDoulaUserId);
  const matchCount = new Map(
    matched.filter((row) => row.userId).map((row) => [row.userId as string, Number(row.n ?? 0)]),
  );

  const rank: Record<string, number> = { owner: 0, admin: 1, doula: 2 };
  return rows
    .map((row) => ({ ...row, primaryClients: matchCount.get(row.userId) ?? 0 }))
    .sort((a, b) => (rank[a.role] ?? 3) - (rank[b.role] ?? 3) || a.name.localeCompare(b.name));
}

/** Staff invites for this org, newest first. Client portal invites are not roster rows. */
export async function orgStaffInvites(organizationId: string) {
  const db = getDb();
  return db
    .select()
    .from(invites)
    .where(and(eq(invites.organizationId, organizationId), eq(invites.kind, "staff")))
    .orderBy(desc(invites.createdAt));
}

/**
 * Who is primary on each family in the org, for the roster's match panel and the client
 * list. Left joins keep families without an engagement — the ones still to be matched.
 */
export async function orgMatches(organizationId: string) {
  const db = getDb();
  return db
    .select({
      clientId: clients.id,
      clientName: clients.displayName,
      stage: pipelineStages.stage,
      engagementId: engagements.id,
      primaryDoulaUserId: engagements.primaryDoulaUserId,
      primaryDoulaName: users.name,
    })
    .from(clients)
    .leftJoin(pipelineStages, eq(pipelineStages.clientId, clients.id))
    .leftJoin(engagements, eq(engagements.clientId, clients.id))
    .leftJoin(users, eq(users.id, engagements.primaryDoulaUserId))
    .where(eq(clients.organizationId, organizationId))
    .orderBy(asc(clients.displayName));
}

/** The org's transactional templates, in the order the editor lists them. */
export async function orgEmailTemplates(organizationId: string) {
  const db = getDb();
  const templates = await db
    .select()
    .from(emailTemplates)
    .where(eq(emailTemplates.organizationId, organizationId))
    .orderBy(asc(emailTemplates.name));

  if (templates.length === 0) return templates.map((template) => ({ ...template, version: 1 }));

  const versions = await db
    .select({ templateId: emailTemplateVersions.templateId, version: emailTemplateVersions.version })
    .from(emailTemplateVersions)
    .where(
      inArray(
        emailTemplateVersions.templateId,
        templates.map((template) => template.id),
      ),
    );
  const latest = new Map<string, number>();
  for (const row of versions) {
    latest.set(row.templateId, Math.max(latest.get(row.templateId) ?? 0, Number(row.version ?? 0)));
  }
  return templates.map((template) => ({ ...template, version: latest.get(template.id) ?? 1 }));
}

/**
 * The practice's word for its own portal, resolved for a client surface (TOK-39 E4).
 * The layout and `generateMetadata` both need it and cannot share a render, so the read
 * lives here once rather than as two hand-rolled selects that could drift.
 */
export async function clientPortalChrome(organizationId: string) {
  const db = getDb();
  const [org] = await db
    .select({ portalName: organizations.portalName, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  return clientChrome(org?.portalName, org?.name);
}

/* ------------------------------------------------------------- TOK-49 CRM board ---- */

/**
 * One row per family, with everything the dense pipeline list renders (TOK-49).
 *
 * The old list joined `assignments` and so could not show a family nobody was on; this
 * reads the org and pulls the match in from the engagement, which is where "primary"
 * actually lives. A doula's view narrows the same query by assignment rather than being a
 * second query that could drift from it.
 */
export type LeadBoardRow = {
  client: typeof clients.$inferSelect;
  stage: PipelineStageName;
  stageEnteredAt: Date | null;
  fitConfirmedAt: Date | null;
  primaryDoulaUserId: string | null;
  primaryDoulaName: string | null;
  ownerName: string | null;
  lastNoteAt: Date | null;
  /**
   * Open invoices, unsigned agreements and cleared money on this family (TOK-53).
   *
   * The board reads it so "Agreement waiting" and "Open invoice" are decided by the same
   * rules everything else is, rather than by a second hand-rolled list in the shell.
   */
  ledger: ClientLedger;
};

export async function leadBoard(
  organizationId: string,
  opts: { doulaUserId?: string } = {},
): Promise<LeadBoardRow[]> {
  const db = getDb();
  const primaryUser = alias(users, "primary_doula_user");
  const ownerUser = alias(users, "owner_user");

  // A doula sees the families she is assigned to, primary or backup, and nothing else.
  let scopedIds: string[] | null = null;
  if (opts.doulaUserId) {
    const mine = await db
      .select({ clientId: assignments.clientId })
      .from(assignments)
      .where(
        and(
          eq(assignments.organizationId, organizationId),
          eq(assignments.userId, opts.doulaUserId),
          eq(assignments.status, "active"),
        ),
      );
    scopedIds = [...new Set(mine.map((row) => row.clientId))];
    if (scopedIds.length === 0) return [];
  }

  const rows = await db
    .select({
      client: clients,
      stage: pipelineStages.stage,
      stageEnteredAt: pipelineStages.enteredAt,
      fitConfirmedAt: pipelineStages.fitConfirmedAt,
      primaryDoulaUserId: engagements.primaryDoulaUserId,
      primaryDoulaName: primaryUser.name,
      ownerName: ownerUser.name,
    })
    .from(clients)
    .leftJoin(pipelineStages, eq(pipelineStages.clientId, clients.id))
    .leftJoin(engagements, eq(engagements.clientId, clients.id))
    .leftJoin(primaryUser, eq(primaryUser.id, engagements.primaryDoulaUserId))
    .leftJoin(ownerUser, eq(ownerUser.id, clients.ownerUserId))
    .where(
      scopedIds
        ? and(eq(clients.organizationId, organizationId), inArray(clients.id, scopedIds))
        : eq(clients.organizationId, organizationId),
    )
    .orderBy(asc(clients.displayName));

  // The newest note per family drives the "consult done, no note" rule. One grouped read
  // rather than a query per row.
  const clientIds = rows.map((row) => row.client.id);
  const noteRows = clientIds.length
    ? await db
        .select({ clientId: clientAiNotes.clientId, at: sql<Date>`max(${clientAiNotes.at})` })
        .from(clientAiNotes)
        .where(
          and(
            eq(clientAiNotes.organizationId, organizationId),
            inArray(clientAiNotes.clientId, clientIds),
          ),
        )
        .groupBy(clientAiNotes.clientId)
    : [];
  const lastNoteOf = new Map(
    noteRows.map((row) => [row.clientId, row.at ? new Date(row.at) : null]),
  );

  // Money, in the same shape Home's cards already use. Two scoped reads rather than a
  // query per family, and the exact function that builds the dense card's ledger, so the
  // bell, the board and Home cannot disagree about what a family owes.
  const [invoiceRows, contractRows] = clientIds.length
    ? await Promise.all([
        db
          .select()
          .from(invoices)
          .where(
            and(
              eq(invoices.organizationId, organizationId),
              inArray(invoices.clientId, clientIds),
            ),
          ),
        db
          .select()
          .from(contracts)
          .where(
            and(
              eq(contracts.organizationId, organizationId),
              inArray(contracts.clientId, clientIds),
            ),
          ),
      ])
    : [[], []];
  const ledgers = clientLedgers(invoiceRows, contractRows);
  const emptyLedger: ClientLedger = { outstandingCents: 0, unsignedCents: 0, clearedCents: 0 };

  // A family can carry more than one engagement row; the board wants her once, with a
  // primary if any engagement names one.
  const byClient = new Map<string, LeadBoardRow>();
  for (const row of rows) {
    const existing = byClient.get(row.client.id);
    if (existing && !row.primaryDoulaUserId) continue;
    byClient.set(row.client.id, {
      client: row.client,
      // A missing pipeline row is a data accident, not a new stage; legacy values are
      // read through the same migration map the funnel uses.
      stage: migrateStage(row.stage, { fitConfirmed: Boolean(row.fitConfirmedAt) }),
      stageEnteredAt: row.stageEnteredAt ?? null,
      fitConfirmedAt: row.fitConfirmedAt ?? null,
      primaryDoulaUserId: row.primaryDoulaUserId ?? null,
      primaryDoulaName: row.primaryDoulaName ?? null,
      ownerName: row.ownerName ?? null,
      lastNoteAt: lastNoteOf.get(row.client.id) ?? null,
      ledger: ledgers[row.client.id] ?? emptyLedger,
    });
  }

  return [...byClient.values()];
}

/** A board row read as a Needs Attention input. One place, so the rules see one shape. */
export function attentionInput(row: LeadBoardRow): NeedsAttentionInput {
  return {
    clientId: row.client.id,
    name: row.client.displayName,
    stage: row.stage,
    followUpDueOn: row.client.followUpDueOn,
    reviewed: row.client.reviewed,
    hasPrimaryDoula: Boolean(row.primaryDoulaUserId),
    stageEnteredAt: row.stageEnteredAt,
    lastNoteAt: row.lastNoteAt,
    unsignedAgreementCents: row.ledger.unsignedCents,
    openInvoiceCents: row.ledger.outstandingCents,
  };
}

/** The queue itself: one row per family, worst first, reasons attached. */
export async function needsAttentionQueue(
  organizationId: string,
  opts: { doulaUserId?: string } = {},
  today: Date = new Date(),
) {
  const rows = await leadBoard(organizationId, opts);
  return needsAttentionRows(rows.map(attentionInput), today);
}

/**
 * The same queue, with the record behind each row (TOK-52 density).
 *
 * Home's Needs attention card used to print a name, a stage chip and a list of reasons —
 * true, and thinner than the same family on the pipeline board. The rules still decide
 * who is in the queue; this only carries the client row along so the card can say what
 * service she booked, how far along she is, and where she came from.
 */
export type NeedsAttentionCard = {
  row: NeedsAttentionRow;
  client: typeof clients.$inferSelect;
};

export async function needsAttentionCards(
  organizationId: string,
  opts: { doulaUserId?: string } = {},
  today: Date = new Date(),
): Promise<NeedsAttentionCard[]> {
  const rows = await leadBoard(organizationId, opts);
  const byId = new Map(rows.map((row) => [row.client.id, row.client]));
  return needsAttentionRows(rows.map(attentionInput), today).flatMap((row) => {
    const client = byId.get(row.clientId);
    return client ? [{ row, client }] : [];
  });
}

/**
 * Every note on one family, newest first, with the author's name where there is one.
 */
export async function leadNotes(organizationId: string, clientId: string) {
  const db = getDb();
  const rows = await db
    .select({
      id: clientAiNotes.id,
      body: clientAiNotes.body,
      source: clientAiNotes.source,
      at: clientAiNotes.at,
      actorUserId: clientAiNotes.actorUserId,
    })
    .from(clientAiNotes)
    .where(
      and(eq(clientAiNotes.organizationId, organizationId), eq(clientAiNotes.clientId, clientId)),
    )
    .orderBy(desc(clientAiNotes.at));

  const actorIds = [...new Set(rows.map((row) => row.actorUserId).filter(Boolean))] as string[];
  const authors = actorIds.length
    ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, actorIds))
    : [];
  const nameOf = new Map(authors.map((row) => [row.id, row.name]));

  return rows.map((row) => ({
    ...row,
    actorName: row.actorUserId ? (nameOf.get(row.actorUserId) ?? null) : null,
  }));
}

/**
 * The dates behind the stage stepper: when this record first entered each stage.
 *
 * "First" rather than "last" on purpose — a record that was walked back and forward again
 * should still read as having reached Consult done on the day the consult happened.
 */
export async function stageHistory(organizationId: string, clientId: string) {
  const db = getDb();
  const events = await db
    .select({ toStage: pipelineEvents.toStage, at: pipelineEvents.at })
    .from(pipelineEvents)
    .where(
      and(eq(pipelineEvents.organizationId, organizationId), eq(pipelineEvents.clientId, clientId)),
    )
    .orderBy(asc(pipelineEvents.at));

  const entered = new Map<PipelineStageName, Date>();
  for (const event of events) {
    const stage = migrateStage(event.toStage);
    if (!entered.has(stage)) entered.set(stage, event.at);
  }
  return entered;
}
