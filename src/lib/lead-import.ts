/**
 * Applying a lead import plan (TOK-49).
 *
 * The decisions — parse, map, dedupe, create vs update — are pure and live in
 * `@/lib/csv-import`. This is the part that touches the database, kept out of the server
 * action so the write path can be exercised on its own rather than only through a session.
 *
 * Org scope is a parameter, not something read from a form: every insert and every update
 * below is pinned to the organization the caller already proved it belongs to.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, memberships, pipelineEvents, pipelineStages, users } from "@/db/schema";
import { appendClientNote } from "@/lib/funnel";
import { newId } from "@/lib/ids";
import { normalizeImportStage, updateValuesFor, type ImportPlan } from "@/lib/csv-import";

/** A `date`-column day read as a timestamp, at noon so no timezone moves it. */
function noonUtc(day: string | null): Date | null {
  return day ? new Date(`${day}T12:00:00Z`) : null;
}

/** This org's roster by lowercased name, for resolving the CSV's Owner column. */
export async function ownerLookup(organizationId: string): Promise<Map<string, string>> {
  const db = getDb();
  const roster = await db
    .select({ userId: users.id, name: users.name })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.organizationId, organizationId));
  return new Map(roster.map((row) => [row.name.trim().toLowerCase(), row.userId]));
}

export async function existingClientsFor(organizationId: string) {
  const db = getDb();
  const rows = await db
    .select({ id: clients.id, email: clients.email, intakeRef: clients.intakeRef })
    .from(clients)
    .where(eq(clients.organizationId, organizationId));
  return rows.map((row) => ({ id: row.id, email: row.email, intakeRef: row.intakeRef }));
}

export type ApplyResult = { created: number; updated: number; skipped: number };

export async function applyImportPlan(input: {
  organizationId: string;
  actorUserId: string;
  plan: ImportPlan;
  /** Lowercased staff name → user id. Names that miss leave the lead unowned. */
  ownerByName: Map<string, string>;
}): Promise<ApplyResult> {
  const db = getDb();
  let created = 0;
  let updated = 0;

  for (const action of input.plan.actions) {
    if (action.kind === "skip") continue;
    const record = action.record;
    const ownerUserId = record.ownerName
      ? (input.ownerByName.get(record.ownerName.trim().toLowerCase()) ?? null)
      : null;

    if (action.kind === "create") {
      const clientId = newId();
      await db.insert(clients).values({
        id: clientId,
        organizationId: input.organizationId,
        displayName: record.displayName,
        email: record.email,
        phone: record.phone,
        source: record.source,
        serviceType: record.serviceType,
        edd: record.edd,
        city: record.city,
        postalCode: record.postalCode,
        hospital: record.hospital,
        assignedProvider: record.assignedProvider,
        insurance: record.insurance,
        insuranceProvider: record.insuranceProvider,
        consultDate: record.consultDate,
        followUpDueOn: record.followUpDueOn,
        lastContactAt: noonUtc(record.lastContactOn),
        intakeRef: record.intakeRef,
        ownerUserId,
      });

      const stage = normalizeImportStage(record.stage, {
        hasConsultDate: Boolean(record.consultDate),
      });
      await db.insert(pipelineStages).values({
        id: newId(),
        organizationId: input.organizationId,
        clientId,
        stage,
        // `fit_confirmed` is a stage an import may land on, so the flag it stands for has
        // to come with it — otherwise the complete rule would read a confirmed match as
        // unconfirmed.
        fitConfirmedAt: stage === "fit_confirmed" ? new Date() : null,
        fitConfirmedByUserId: stage === "fit_confirmed" ? input.actorUserId : null,
      });
      await db.insert(pipelineEvents).values({
        id: newId(),
        organizationId: input.organizationId,
        clientId,
        fromStage: null,
        toStage: stage,
        actorUserId: input.actorUserId,
        reason: "csv_import",
      });
      if (record.notes) {
        await appendClientNote({
          organizationId: input.organizationId,
          clientId,
          body: record.notes,
          source: "import",
          actorUserId: input.actorUserId,
        });
      }
      created += 1;
      continue;
    }

    // Re-import updates the record in place and never touches the stage: the pipeline is
    // Tokos's opinion now, not the spreadsheet's.
    await db
      .update(clients)
      .set({
        ...updateValuesFor(record),
        ...(ownerUserId ? { ownerUserId } : {}),
        ...(record.lastContactOn ? { lastContactAt: noonUtc(record.lastContactOn) } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(eq(clients.organizationId, input.organizationId), eq(clients.id, action.clientId)),
      );
    if (record.notes) {
      await appendClientNote({
        organizationId: input.organizationId,
        clientId: action.clientId,
        body: record.notes,
        source: "import",
        actorUserId: input.actorUserId,
      });
    }
    updated += 1;
  }

  return { created, updated, skipped: input.plan.skipped };
}
