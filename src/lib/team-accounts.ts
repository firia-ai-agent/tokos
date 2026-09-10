/**
 * The two account grids on `/doula/team` (TOK-57).
 *
 * The founder's ask, against a competitor's screen: "We can have Team Members Accounts
 * and Family Accounts — in the family accounts we have all of their data / profile
 * information there and can 'match' them with a doula there. Just like the screenshot we
 * can see who is pending vs active for the portal and can click add team member account
 * which opens up a popup."
 *
 * The insight worth encoding is that a *person who has been invited* and a *person who
 * has joined* are the same row on that screen with a different dot next to them. Before
 * this, the roster and the pending-invite list were two tables in two sections that never
 * added up to "who is on this team". So both sides collapse into one `TeamAccount` here,
 * and the same thing happens to a family: a client with a live portal login and a client
 * who was mailed one are one row with a status, not two lists.
 *
 * Pure and database-free on purpose — `@/lib/queries` does the reads, this decides what
 * the reader sees. The permission rules stay in `@/lib/team`; nothing here grants
 * anything.
 */

import { inviteStatus, isEmailish, normalizeInviteEmail, normalizeInviteRole, roleLabel } from "@/lib/team";
import type { InvitableRole } from "@/lib/team";

/** Where a person is with their account. The dot in the screenshot, named. */
export const ACCOUNT_STATUSES = ["active", "pending", "expired", "none"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  active: "Active",
  pending: "Pending",
  expired: "Expired",
  none: "No portal yet",
};

/** Teal for someone who is here, coral for someone we are still waiting on. */
export const ACCOUNT_STATUS_TONES: Record<AccountStatus, "teal" | "coral" | "muted"> = {
  active: "teal",
  pending: "coral",
  expired: "muted",
  none: "muted",
};

/* --------------------------------------------------------------- team accounts ---- */

export type RosterMember = {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  credentialsLabel: string | null;
  joinedAt: Date;
  primaryClients: number;
  photoFileId?: string | null;
};

export type StaffInvite = {
  id: string;
  email: string;
  role: string;
  token: string;
  name?: string | null;
  expiresAt: Date;
  acceptedAt?: Date | null;
};

export type TeamAccount = {
  /** Stable React key across both sources. */
  key: string;
  source: "member" | "invite";
  name: string;
  email: string;
  role: string;
  roleLabel: string;
  status: AccountStatus;
  /** Families this person is primary on. Zero for an invite — she carries nobody yet. */
  primaryClients: number;
  credentialsLabel: string | null;
  photoFileId: string | null;
  userId: string | null;
  inviteId: string | null;
  inviteToken: string | null;
  joinedAt: Date | null;
  expiresAt: Date | null;
};

/** Founders first, then admins, then doulas — the order the roster already sorted in. */
const ROLE_RANK: Record<string, number> = { owner: 0, admin: 1, doula: 2 };

/** Active people read first; the ones we are waiting on sit under them. */
const STATUS_RANK: Record<AccountStatus, number> = {
  active: 0,
  pending: 1,
  expired: 2,
  none: 3,
};

/**
 * An invite with nobody's name on it still has to say *who* on the card. The address is
 * the only thing we know, so the local part stands in until they type a name on accept —
 * better than an empty heading, and it is never presented as a real name elsewhere.
 */
export function inviteDisplayName(invite: StaffInvite): string {
  const given = String(invite.name ?? "").trim();
  if (given) return given;
  return normalizeInviteEmail(invite.email).split("@")[0] || invite.email;
}

/**
 * One list of everybody: joined and still-deciding, sorted so the team reads as a team.
 * Expired invites are included and marked — an owner who cannot see that Alex's link
 * lapsed will keep waiting for Alex.
 */
export function teamAccounts(input: {
  members: readonly RosterMember[];
  invites: readonly StaffInvite[];
  now?: Date;
}): TeamAccount[] {
  const now = input.now ?? new Date();
  const memberEmails = new Set(input.members.map((member) => normalizeInviteEmail(member.email)));

  const fromMembers: TeamAccount[] = input.members.map((member) => ({
    key: `member:${member.membershipId}`,
    source: "member",
    name: member.name,
    email: member.email,
    role: member.role,
    roleLabel: roleLabel(member.role),
    status: "active",
    primaryClients: member.primaryClients,
    credentialsLabel: member.credentialsLabel,
    photoFileId: member.photoFileId ?? null,
    userId: member.userId,
    inviteId: null,
    inviteToken: null,
    joinedAt: member.joinedAt,
    expiresAt: null,
  }));

  const fromInvites: TeamAccount[] = input.invites
    // Someone who accepted is on the roster above; showing the invite too would double them.
    .filter((invite) => !invite.acceptedAt)
    .filter((invite) => !memberEmails.has(normalizeInviteEmail(invite.email)))
    .map((invite) => ({
      key: `invite:${invite.id}`,
      source: "invite",
      name: inviteDisplayName(invite),
      email: invite.email,
      role: invite.role,
      roleLabel: roleLabel(invite.role),
      status: inviteStatus(invite, now) === "expired" ? "expired" : "pending",
      primaryClients: 0,
      credentialsLabel: null,
      photoFileId: null,
      userId: null,
      inviteId: invite.id,
      inviteToken: invite.token,
      joinedAt: null,
      expiresAt: invite.expiresAt,
    }));

  return [...fromMembers, ...fromInvites].sort(
    (a, b) =>
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      (ROLE_RANK[a.role] ?? 3) - (ROLE_RANK[b.role] ?? 3) ||
      a.name.localeCompare(b.name),
  );
}

export type TeamAccountGroups = {
  active: TeamAccount[];
  pending: TeamAccount[];
  expired: TeamAccount[];
};

/** The grid draws active and pending as separate blocks, so split once here. */
export function groupTeamAccounts(accounts: readonly TeamAccount[]): TeamAccountGroups {
  return {
    active: accounts.filter((account) => account.status === "active"),
    pending: accounts.filter((account) => account.status === "pending"),
    expired: accounts.filter((account) => account.status === "expired"),
  };
}

/* ------------------------------------------------------------- family accounts ---- */

export type PortalAccessRow = {
  status?: string | null;
  userId?: string | null;
};

/**
 * A family's portal state. `active` means she has signed in and the row points at a user;
 * a row that says active with no user behind it is an invite that was never finished, and
 * calling that "active" on an owner's screen is how a family gets forgotten.
 */
export function portalStatus(access: PortalAccessRow | null | undefined): AccountStatus {
  if (!access) return "none";
  const status = String(access.status ?? "").trim().toLowerCase();
  if (status === "active" && access.userId) return "active";
  if (status === "revoked" || status === "disabled") return "none";
  return "pending";
}

export type FamilyAccountInput = {
  clientId: string;
  name: string;
  email: string;
  phone: string | null;
  edd: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  serviceType: string | null;
  stage: string | null;
  primaryDoulaUserId: string | null;
  primaryDoulaName: string | null;
  access: PortalAccessRow | null;
};

export type FamilyAccount = Omit<FamilyAccountInput, "access"> & {
  portal: AccountStatus;
  matched: boolean;
  /** "Arlington, VA 22201" — whatever of it we hold, in reading order. */
  location: string;
};

export function familyLocation(input: {
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
}): string {
  const city = String(input.city ?? "").trim();
  const region = String(input.region ?? "").trim();
  const zip = String(input.postalCode ?? "").trim();
  const place = [city, region].filter(Boolean).join(", ");
  return [place, zip].filter(Boolean).join(" ");
}

/**
 * Families, unmatched first. The one question this grid exists to answer is "who is still
 * waiting for a doula", so those rows sort to the top rather than to wherever the
 * alphabet puts them.
 */
export function familyAccounts(rows: readonly FamilyAccountInput[]): FamilyAccount[] {
  return rows
    .map((row) => ({
      ...row,
      portal: portalStatus(row.access),
      matched: Boolean(row.primaryDoulaUserId),
      location: familyLocation(row),
    }))
    .map(({ access: _access, ...rest }) => rest as FamilyAccount)
    .sort(
      (a, b) =>
        Number(a.matched) - Number(b.matched) || a.name.localeCompare(b.name),
    );
}

/* ------------------------------------------------------------------ add member ---- */

export type AddTeamMemberInput = {
  name: string;
  email: string;
  role: string;
};

export type AddTeamMemberParsed = {
  name: string;
  email: string;
  role: InvitableRole;
};

export type AddTeamMemberResult =
  | { ok: true; value: AddTeamMemberParsed }
  | { ok: false; reason: "name" | "email" };

/**
 * What the Add-team-member popup posts: a name, a work email, and a role. The role is
 * normalised through `@/lib/team` so the popup cannot hand out ownership either, and a
 * blank name is refused here rather than becoming an invite card with no name on it.
 */
export function parseAddTeamMember(input: AddTeamMemberInput): AddTeamMemberResult {
  const name = String(input.name ?? "").trim().replace(/\s+/g, " ");
  const email = normalizeInviteEmail(input.email);
  if (!name) return { ok: false, reason: "name" };
  if (!isEmailish(email)) return { ok: false, reason: "email" };
  return { ok: true, value: { name: name.slice(0, 120), email, role: normalizeInviteRole(input.role) } };
}
