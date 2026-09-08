"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  assignments,
  clients,
  engagements,
  invites,
  memberships,
  organizations,
  users,
} from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { appUrl } from "@/lib/env";
import { newId } from "@/lib/ids";
import { enqueueEmail } from "@/lib/outbox";
import { requireStaff, requireStaffManager } from "@/lib/tenancy";
import {
  canAssignPrimaryDoula,
  canInviteStaff,
  createInviteToken,
  inviteExpiry,
  inviteStatus,
  inviteUrl,
  normalizeInviteEmail,
  normalizeInviteRole,
  roleLabel,
} from "@/lib/team";

/** Defaults an agency match inherits when a family has no engagement row yet. */
const DEFAULT_PACKAGE_LABEL = "Birth support package";
const DEFAULT_AMOUNT_CENTS = 280000;

function revalidateTeam(clientId?: string) {
  revalidatePath("/doula/team");
  revalidatePath("/doula/clients");
  if (clientId) revalidatePath(`/doula/clients/${clientId}`);
}

/**
 * Invites a doula or admin into this workspace. The role is normalised (an `owner`
 * posted by hand comes back as `doula`), the address is checked against the people who
 * are already here, and the token is a CSPRNG value — it is the entire credential for
 * `/invite/<token>`, which already exists and creates the membership on accept.
 */
export async function inviteStaffAction(formData: FormData) {
  const staff = await requireStaffManager();
  const email = normalizeInviteEmail(String(formData.get("email") ?? ""));
  const role = normalizeInviteRole(String(formData.get("role") ?? ""));
  const db = getDb();

  const existingMembers = await db
    .select({ email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.organizationId, staff.organizationId));
  const openInvites = await db
    .select()
    .from(invites)
    .where(and(eq(invites.organizationId, staff.organizationId), eq(invites.kind, "staff")));

  const guard = canInviteStaff({
    actorRole: staff.membershipRole,
    email,
    memberEmails: existingMembers.map((row) => row.email),
    pendingEmails: openInvites
      .filter((invite) => inviteStatus(invite) === "pending")
      .map((invite) => invite.email),
  });
  if (!guard.ok) redirect(`/doula/team?error=${guard.reason}`);

  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, staff.organizationId))
    .limit(1);

  const token = createInviteToken();
  const id = newId();
  await db.insert(invites).values({
    id,
    organizationId: staff.organizationId,
    email,
    role,
    token,
    kind: "staff",
    expiresAt: inviteExpiry(),
    invitedByUserId: staff.userId,
  });

  // The accept link is absolute: the invitee is not signed in yet, so a portal-relative
  // path would have nowhere to resolve against.
  await enqueueEmail({
    organizationId: staff.organizationId,
    triggerKey: "doula_invited",
    toEmail: email,
    vars: {
      org_name: org?.name ?? "Tokos",
      invite_url: inviteUrl(appUrl(), token),
      invite_role: roleLabel(role),
      token,
      portal_url: `${appUrl()}/login`,
    },
  });

  await writeAudit({
    organizationId: staff.organizationId,
    actorUserId: staff.userId,
    action: "invite.sent",
    entityType: "invite",
    entityId: id,
    metadata: { role, kind: "staff" },
  });

  revalidateTeam();
  redirect("/doula/team?saved=invite");
}

/** Withdraws a staff invite that has not been accepted. Org-scoped by the delete. */
export async function revokeInviteAction(formData: FormData) {
  const staff = await requireStaffManager();
  const inviteId = String(formData.get("inviteId") ?? "");
  if (!inviteId) redirect("/doula/team?error=invite");
  const db = getDb();
  const [invite] = await db
    .select()
    .from(invites)
    .where(and(eq(invites.id, inviteId), eq(invites.organizationId, staff.organizationId)))
    .limit(1);
  if (!invite || invite.acceptedAt) redirect("/doula/team?error=invite");

  await db.delete(invites).where(eq(invites.id, invite.id));
  await writeAudit({
    organizationId: staff.organizationId,
    actorUserId: staff.userId,
    action: "invite.revoked",
    entityType: "invite",
    entityId: invite.id,
    metadata: { role: invite.role },
  });
  revalidateTeam();
  redirect("/doula/team?saved=revoked");
}

/**
 * Names the primary doula on a family's engagement, creating the engagement when the
 * family does not have one yet. Both the client id and the doula id arrive from a form,
 * so `canAssignPrimaryDoula` re-derives all three orgs from rows read back by id before
 * anything is written — a Cedar doula id posted into NOVA has no membership here and is
 * refused.
 */
export async function assignPrimaryDoulaAction(formData: FormData) {
  const staff = await requireStaffManager();
  const clientId = String(formData.get("clientId") ?? "");
  const doulaUserId = String(formData.get("doulaUserId") ?? "");
  // The return path is posted, so it is not used as given: `client` sends the doula back
  // to the record they came from, anything else lands on the roster.
  const back =
    formData.get("returnTo") === "client" && /^[0-9a-f-]{36}$/i.test(clientId)
      ? `/doula/clients/${clientId}`
      : "/doula/team";
  if (!clientId) redirect(`${back}?error=match`);

  const db = getDb();
  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.organizationId, staff.organizationId)))
    .limit(1);
  if (!client) redirect(`${back}?error=match`);

  // Empty select value means "unmatch": clear the primary rather than guessing one.
  const clearing = doulaUserId === "";
  const [membership] = clearing
    ? [null]
    : await db
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.userId, doulaUserId),
            eq(memberships.organizationId, staff.organizationId),
          ),
        )
        .limit(1);

  if (!clearing) {
    const guard = canAssignPrimaryDoula({
      actorRole: staff.membershipRole,
      actorOrganizationId: staff.organizationId,
      clientOrganizationId: client.organizationId,
      memberOrganizationId: membership?.organizationId ?? null,
    });
    if (!guard.ok) redirect(`${back}?error=${guard.reason}`);
  }

  const [engagement] = await db
    .select()
    .from(engagements)
    .where(
      and(eq(engagements.clientId, client.id), eq(engagements.organizationId, staff.organizationId)),
    )
    .limit(1);

  const engagementId = engagement?.id ?? newId();
  if (engagement) {
    await db
      .update(engagements)
      .set({ primaryDoulaUserId: clearing ? null : doulaUserId, updatedAt: new Date() })
      .where(eq(engagements.id, engagement.id));
  } else {
    await db.insert(engagements).values({
      id: engagementId,
      organizationId: staff.organizationId,
      clientId: client.id,
      packageLabel: DEFAULT_PACKAGE_LABEL,
      amountCents: DEFAULT_AMOUNT_CENTS,
      targetDate: client.edd,
      primaryDoulaUserId: clearing ? null : doulaUserId,
      status: "open",
    });
  }

  // Matching is additive: the new primary picks the family up on their own Home and
  // Clients list, and whoever was already carrying them keeps their assignment.
  if (!clearing) {
    const [existingAssignment] = await db
      .select()
      .from(assignments)
      .where(and(eq(assignments.clientId, client.id), eq(assignments.userId, doulaUserId)))
      .limit(1);
    if (!existingAssignment) {
      await db.insert(assignments).values({
        id: newId(),
        organizationId: staff.organizationId,
        clientId: client.id,
        userId: doulaUserId,
        role: "primary",
        status: "active",
      });
    }
  }

  await writeAudit({
    organizationId: staff.organizationId,
    actorUserId: staff.userId,
    action: clearing ? "match.cleared" : "match.assigned",
    entityType: "engagement",
    entityId: engagementId,
    metadata: { client_id: client.id },
  });

  revalidateTeam(client.id);
  revalidatePath("/doula");
  redirect(`${back}?saved=match`);
}

/** Read-only helper for pages that only need to know whether to render write controls. */
export async function currentStaffRole() {
  const staff = await requireStaff();
  return staff.membershipRole;
}
