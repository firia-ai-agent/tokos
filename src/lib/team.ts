/**
 * Agency roster helpers: who may manage the team, what a staff invite is worth, and the
 * guard that decides whether a primary-doula match is allowed to be written.
 *
 * Everything here is pure so the rules are testable without a database — the server
 * actions in `@/app/actions/team` do the reads and writes around them.
 */

/** Roles a membership row can carry. `owner` is seeded, never handed out by invite. */
export const STAFF_ROLES = ["owner", "admin", "doula"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** Roles an owner/admin may hand out on an invite. Ownership does not travel by email. */
export const INVITABLE_ROLES = ["doula", "admin"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export const INVITE_TTL_DAYS = 7;

const ROLE_LABELS: Record<StaffRole, string> = {
  owner: "Founder",
  admin: "Admin",
  doula: "Doula",
};

export function roleLabel(role: string | null | undefined): string {
  return ROLE_LABELS[(role ?? "doula") as StaffRole] ?? "Doula";
}

/** Owners and admins run the roster; a doula sees it read-only. */
export function canManageTeam(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

/**
 * An invite may only carry `doula` or `admin`. Anything else — including a posted
 * `owner` — falls back to the least privileged role rather than being honoured.
 */
export function normalizeInviteRole(raw: string | null | undefined): InvitableRole {
  const value = String(raw ?? "").trim().toLowerCase();
  return (INVITABLE_ROLES as readonly string[]).includes(value)
    ? (value as InvitableRole)
    : "doula";
}

/**
 * Invite tokens are the whole credential for `/invite/<token>`, so they come from the
 * platform CSPRNG, not from anything guessable like the email or a timestamp.
 */
export function createInviteToken(bytes = 24): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  let out = "";
  for (const byte of buffer) out += byte.toString(16).padStart(2, "0");
  return out;
}

export function inviteExpiry(from: Date = new Date(), days = INVITE_TTL_DAYS): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

export function inviteUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/invite/${token}`;
}

export type InviteRow = {
  acceptedAt?: Date | null;
  expiresAt: Date;
};

export type InviteStatus = "accepted" | "expired" | "pending";

export function inviteStatus(invite: InviteRow, now: Date = new Date()): InviteStatus {
  if (invite.acceptedAt) return "accepted";
  if (invite.expiresAt.getTime() <= now.getTime()) return "expired";
  return "pending";
}

/** Only live invites belong on the roster's "waiting to join" list. */
export function pendingInvites<T extends InviteRow>(invites: T[], now: Date = new Date()): T[] {
  return invites.filter((invite) => inviteStatus(invite, now) === "pending");
}

export function normalizeInviteEmail(raw: string | null | undefined): string {
  return String(raw ?? "").trim().toLowerCase();
}

/** Deliberately loose — the real check is that the invite email can receive mail. */
export function isEmailish(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export type InviteGuardInput = {
  actorRole: string | null | undefined;
  email: string;
  /** Emails that already have a membership in this org. */
  memberEmails: string[];
  /** Emails with a live, unaccepted invite in this org. */
  pendingEmails: string[];
};

export type GuardResult = { ok: true } | { ok: false; reason: string };

/**
 * The invite form runs through here before anything is inserted: a doula cannot invite,
 * a malformed address cannot be sent to, and the same person cannot be invited twice or
 * invited into a workspace they are already in.
 */
export function canInviteStaff(input: InviteGuardInput): GuardResult {
  if (!canManageTeam(input.actorRole)) return { ok: false, reason: "role" };
  const email = normalizeInviteEmail(input.email);
  if (!isEmailish(email)) return { ok: false, reason: "email" };
  if (input.memberEmails.map(normalizeInviteEmail).includes(email)) {
    return { ok: false, reason: "member" };
  }
  if (input.pendingEmails.map(normalizeInviteEmail).includes(email)) {
    return { ok: false, reason: "duplicate" };
  }
  return { ok: true };
}

export type MatchGuardInput = {
  actorRole: string | null | undefined;
  /** Org on the acting session. */
  actorOrganizationId: string;
  /** Org on the client row that was read back by id. */
  clientOrganizationId: string;
  /** Org on the membership of the doula being assigned, or null when there is none. */
  memberOrganizationId: string | null;
};

/**
 * The match write is the one place a user id from a form ends up on another tenant's
 * row, so all three orgs have to agree: the actor's, the client's, and the membership
 * of the doula being named. A doula who is not a member of this org is not assignable,
 * whatever the posted id says.
 */
export function canAssignPrimaryDoula(input: MatchGuardInput): GuardResult {
  if (!canManageTeam(input.actorRole)) return { ok: false, reason: "role" };
  if (!input.actorOrganizationId) return { ok: false, reason: "org" };
  if (input.actorOrganizationId !== input.clientOrganizationId) {
    return { ok: false, reason: "client" };
  }
  if (!input.memberOrganizationId) return { ok: false, reason: "member" };
  if (input.actorOrganizationId !== input.memberOrganizationId) {
    return { ok: false, reason: "member" };
  }
  return { ok: true };
}
