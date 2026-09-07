import { and, count, eq, gte, sql } from "drizzle-orm";
import { addDays } from "date-fns";
import { getDb } from "@/db";
import {
  assignments,
  calendarEvents,
  clients,
  contracts,
  formAssignments,
  invoices,
  pipelineStages,
  portalMessages,
  resourceShares,
} from "@/db/schema";
import { formatCents } from "@/lib/money";
import { STAGE_LABELS, type PipelineStageName } from "@/lib/pipeline";

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

  const outstanding = myInvoices
    .filter((invoice) => invoice.status === "open")
    .reduce((sum, invoice) => sum + invoice.amountCents, 0);
  const cleared = myInvoices
    .filter((invoice) => invoice.status === "paid")
    .reduce((sum, invoice) => sum + invoice.amountCents, 0);

  const allContracts = await db
    .select()
    .from(contracts)
    .where(eq(contracts.organizationId, organizationId));
  const myContracts = allContracts.filter((contract) => clientIds.includes(contract.clientId));
  const pipelineCents = myContracts
    .filter((contract) => contract.status !== "voided" && !contract.signedAt)
    .reduce((sum, contract) => sum + contract.amountCents, 0);

  const today = new Date();
  const windowEnd = addDays(today, 30);
  const birthsSoon = myClients.filter((row) => {
    if (!row.client.edd) return false;
    const edd = new Date(row.client.edd);
    return edd >= today && edd <= windowEnd;
  });

  const activeCare = myClients.filter((row) => row.stage === "active_care");

  return {
    clients: myClients,
    kpis: [
      { label: "Outstanding", value: formatCents(outstanding), hint: "Open invoices" },
      { label: "Cleared", value: formatCents(cleared), hint: "Paid invoices" },
      { label: "Unsigned agreements", value: formatCents(pipelineCents), hint: "Sent, not signed" },
      { label: "Active care", value: String(activeCare.length), hint: "Clients in care" },
      { label: "Births in 30 days", value: String(birthsSoon.length), hint: "By due date" },
    ],
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
