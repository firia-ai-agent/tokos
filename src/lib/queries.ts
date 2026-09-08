import { and, asc, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { addDays, differenceInCalendarWeeks, format, startOfMonth, subMonths } from "date-fns";
import { getDb } from "@/db";
import {
  assignments,
  calendarEvents,
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
  pipelineStages,
  portalMessages,
  resourceShares,
  resources,
  users,
} from "@/db/schema";
import { formatCents } from "@/lib/money";
import { STAGE_LABELS, type PipelineStageName } from "@/lib/pipeline";

export type HomeKpi = {
  label: string;
  value: string;
  hint: string;
  tone: "teal" | "coral" | "ink";
};

export type HomeAttention = {
  id: string;
  title: string;
  detail: string;
  href: string;
  cta: string;
};

export type HomeTimelineItem = {
  id: string;
  name: string;
  edd: string;
  eddLabel: string;
  weeksLabel: string;
  stage: string;
  href: string;
};

export type HomeMonthBar = {
  key: string;
  label: string;
  cents: number;
  display: string;
};

export async function revenueHome(organizationId: string, doulaUserId: string) {
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

  const activeCare = myClients.filter((row) => row.stage === "active_care");
  const leadOrFit = myClients.filter(
    (row) =>
      row.stage === "new_lead" ||
      row.stage === "intro" ||
      row.stage === "fit" ||
      row.stage === "agreement_signed",
  );

  const incompleteForms = clientIds.length
    ? await db
        .select({
          clientId: formAssignments.clientId,
          n: count(),
        })
        .from(formAssignments)
        .where(
          and(
            eq(formAssignments.organizationId, organizationId),
            eq(formAssignments.status, "incomplete"),
            inArray(formAssignments.clientId, clientIds),
          ),
        )
        .groupBy(formAssignments.clientId)
    : [];

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

  const clientName = (id: string) =>
    myClients.find((row) => row.client.id === id)?.client.displayName ?? "Family";

  const attention: HomeAttention[] = [];

  for (const contract of unsignedContracts.slice(0, 4)) {
    attention.push({
      id: `contract-${contract.id}`,
      title: `Agreement waiting — ${clientName(contract.clientId)}`,
      detail: `${formatCents(contract.amountCents)} · sent, not signed`,
      href: `/doula/clients/${contract.clientId}`,
      cta: "Open",
    });
  }

  for (const invoice of outstandingInvoices.slice(0, 4)) {
    attention.push({
      id: `invoice-${invoice.id}`,
      title: `Open invoice — ${clientName(invoice.clientId)}`,
      detail: `${formatCents(invoice.amountCents)} · ${invoice.number ?? "unnumbered"}`,
      href: `/doula/invoices`,
      cta: "Review",
    });
  }

  for (const row of incompleteForms.slice(0, 4)) {
    const n = Number(row.n ?? 0);
    if (n <= 0) continue;
    attention.push({
      id: `forms-${row.clientId}`,
      title: `Forms incomplete — ${clientName(row.clientId)}`,
      detail: `${n} form${n === 1 ? "" : "s"} still open in the portal`,
      href: `/doula/clients/${row.clientId}`,
      cta: "View",
    });
  }

  for (const row of leadOrFit.slice(0, 4)) {
    attention.push({
      id: `stage-${row.client.id}`,
      title: `${row.client.displayName} · ${stageLabel(row.stage)}`,
      detail: row.client.edd
        ? `EDD ${format(new Date(`${row.client.edd}T12:00:00`), "MMM d")} · keep the funnel moving`
        : "Keep the funnel moving",
      href: `/doula/clients/${row.client.id}`,
      cta: "Open",
    });
  }

  const uniqueAttention = attention
    .filter((item, index, arr) => arr.findIndex((other) => other.id === item.id) === index)
    .slice(0, 6);

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
        stage: row.stage,
        href: `/doula/clients/${row.client.id}`,
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
      hint:
        activeCare.length > 0
          ? `${activeCare.length} in care`
          : `${leadOrFit.length} in funnel`,
      tone: "teal",
    },
    {
      label: "Births · next 30 days",
      value: String(birthsSoon.length),
      hint: birthsSoon.length === 0 ? "None on the board" : "By due date",
      tone: birthsSoon.length > 0 ? "coral" : "ink",
    },
  ];

  return {
    clients: myClients,
    kpis,
    monthBars,
    attention: uniqueAttention,
    timeline,
    reviewCount: uniqueAttention.length,
    clearedTotal: cleared,
    outstandingTotal: outstanding,
  };
}

export async function clientChecklist(organizationId: string, clientId: string) {
  const db = getDb();
  const [formsIncomplete] = await db
    .select({ n: count() })
    .from(formAssignments)
    .where(
      and(
        eq(formAssignments.organizationId, organizationId),
        eq(formAssignments.clientId, clientId),
        eq(formAssignments.status, "incomplete"),
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

export function stageLabel(stage: string) {
  return STAGE_LABELS[stage as PipelineStageName] ?? stage;
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
    assignments: assignmentsWithAnswers,
    openCount: rows.filter((row) => row.assignment.status === "incomplete").length,
    completeCount: rows.filter((row) => row.assignment.status === "complete").length,
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

/** Lightweight attention list for shell notifications — real ledger/pipeline only. */
export async function shellAttention(organizationId: string, doulaUserId: string) {
  const db = getDb();
  const myClients = await db
    .select({
      client: clients,
      stage: pipelineStages.stage,
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
  if (clientIds.length === 0) return { count: 0, items: [] as HomeAttention[] };

  const myInvoices = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.organizationId, organizationId), inArray(invoices.clientId, clientIds)));
  const myContracts = await db
    .select()
    .from(contracts)
    .where(and(eq(contracts.organizationId, organizationId), inArray(contracts.clientId, clientIds)));

  const nameOf = (id: string) =>
    myClients.find((row) => row.client.id === id)?.client.displayName ?? "Family";

  const items: HomeAttention[] = [];

  for (const contract of myContracts.filter((c) => c.status !== "voided" && !c.signedAt).slice(0, 3)) {
    items.push({
      id: `contract-${contract.id}`,
      title: `Agreement waiting — ${nameOf(contract.clientId)}`,
      detail: `${formatCents(contract.amountCents)} · not signed`,
      href: `/doula/clients/${contract.clientId}`,
      cta: "Open",
    });
  }

  for (const invoice of myInvoices.filter((inv) => inv.status === "open").slice(0, 3)) {
    items.push({
      id: `invoice-${invoice.id}`,
      title: `Open invoice — ${nameOf(invoice.clientId)}`,
      detail: formatCents(invoice.amountCents),
      href: "/doula/invoices",
      cta: "Review",
    });
  }

  for (const row of myClients
    .filter((r) =>
      ["new_lead", "intro", "fit", "agreement_signed"].includes(r.stage),
    )
    .slice(0, 3)) {
    items.push({
      id: `stage-${row.client.id}`,
      title: `${row.client.displayName} · ${stageLabel(row.stage)}`,
      detail: "Keep intake moving",
      href: `/doula/clients/${row.client.id}`,
      cta: "Open",
    });
  }

  const unique = items
    .filter((item, index, arr) => arr.findIndex((other) => other.id === item.id) === index)
    .slice(0, 5);

  return { count: unique.length, items: unique };
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
