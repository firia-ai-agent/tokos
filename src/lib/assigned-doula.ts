/**
 * Who the family is actually working with (TOK-38).
 *
 * Every client-facing surface names a person — "Maya Chen", not "Your doula". The one
 * source of truth is the engagement's `primaryDoulaUserId`, falling back to the active
 * `assignments` row, falling back to the practice's own portal name so a family that has
 * not been matched yet still reads a name instead of a placeholder.
 *
 * `pickAssignedDoula` is pure so the precedence and the org check are testable without a
 * database; `resolveAssignedDoulaName` does the reads around it and is `cache`d so the
 * portal pages that each need the name in one render only pay for it once.
 */

import { cache } from "react";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { assignments, engagements, organizations, users } from "@/db/schema";

export type AssignedDoulaSource = "engagement" | "assignment" | "organization";

export type AssignedDoula = {
  /** Full name for headers and sender labels: "Maya Chen". */
  name: string;
  /** "Maya" — what reads naturally mid-sentence or in a placeholder. */
  firstName: string;
  /** null when nobody is assigned yet and this is the practice's name. */
  userId: string | null;
  source: AssignedDoulaSource;
};

/** A row the resolver found, before precedence and the org check are applied. */
export type DoulaCandidate = {
  organizationId: string;
  userId: string | null;
  name: string | null;
  source: "engagement" | "assignment";
};

/** Last resort when a practice has not set a portal name either. */
const UNNAMED_PRACTICE = "Your care team";

/** The engagement's primary wins; an active assignment is the backstop. */
const PRECEDENCE: Record<DoulaCandidate["source"], number> = {
  engagement: 0,
  assignment: 1,
};

function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/**
 * Pick the name the family should see. Candidates from another organization are dropped
 * here as well as in SQL — a display helper is the last place a tenant boundary should
 * be assumed rather than checked.
 */
export function pickAssignedDoula({
  organizationId,
  candidates,
  portalName,
}: {
  organizationId: string;
  candidates: readonly DoulaCandidate[];
  portalName?: string | null;
}): AssignedDoula {
  const usable = candidates
    .flatMap((candidate) => {
      if (candidate.organizationId !== organizationId) return [];
      const name = candidate.name?.trim();
      if (!candidate.userId || !name) return [];
      return [{ name, userId: candidate.userId, source: candidate.source }];
    })
    .sort((a, b) => PRECEDENCE[a.source] - PRECEDENCE[b.source]);

  const match = usable[0];
  if (match) {
    return {
      name: match.name,
      firstName: firstNameOf(match.name),
      userId: match.userId,
      source: match.source,
    };
  }

  // No match yet: the practice speaks for itself, whole name and all — "NOVA Birth
  // Prep" has no first name worth splitting out.
  const practice = portalName?.trim() || UNNAMED_PRACTICE;
  return { name: practice, firstName: practice, userId: null, source: "organization" };
}

/**
 * The assigned doula's display name for one family. Org-scoped on every read; the
 * fallback is the org's own portal name, so this never returns null and no caller has
 * to keep a "Your doula" string around for the empty case.
 */
export const resolveAssignedDoulaName = cache(async function resolveAssignedDoulaName({
  organizationId,
  clientId,
}: {
  organizationId: string;
  clientId: string;
}): Promise<AssignedDoula> {
  const db = getDb();

  const engagementRows = await db
    .select({
      organizationId: engagements.organizationId,
      userId: engagements.primaryDoulaUserId,
      name: users.name,
    })
    .from(engagements)
    .innerJoin(users, eq(users.id, engagements.primaryDoulaUserId))
    .where(
      and(
        eq(engagements.organizationId, organizationId),
        eq(engagements.clientId, clientId),
      ),
    )
    .orderBy(desc(engagements.createdAt))
    .limit(1);

  const assignmentRows = await db
    .select({
      organizationId: assignments.organizationId,
      userId: assignments.userId,
      name: users.name,
      role: assignments.role,
    })
    .from(assignments)
    .innerJoin(users, eq(users.id, assignments.userId))
    .where(
      and(
        eq(assignments.organizationId, organizationId),
        eq(assignments.clientId, clientId),
        eq(assignments.status, "active"),
      ),
    );

  const [org] = await db
    .select({ portalName: organizations.portalName, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  const candidates: DoulaCandidate[] = [
    ...engagementRows.map((row) => ({ ...row, source: "engagement" as const })),
    // A co-doula is still on the family's team, but the primary is who the portal names.
    ...assignmentRows
      .slice()
      .sort((a, b) => Number(b.role === "primary") - Number(a.role === "primary"))
      .map((row) => ({
        organizationId: row.organizationId,
        userId: row.userId,
        name: row.name,
        source: "assignment" as const,
      })),
  ];

  return pickAssignedDoula({
    organizationId,
    candidates,
    portalName: org?.portalName ?? org?.name ?? null,
  });
});
