import Link from "next/link";
import { format } from "date-fns";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/tenancy";
import { orgMatches, orgStaffInvites, teamRoster } from "@/lib/queries";
import { stageLabel } from "@/lib/pipeline";
import { serviceTypeLabel } from "@/lib/lead-fields";
import {
  INVITE_TTL_DAYS,
  canManageTeam,
  inviteUrl,
  roleLabel,
} from "@/lib/team";
import {
  ACCOUNT_STATUS_LABELS,
  ACCOUNT_STATUS_TONES,
  familyAccounts,
  groupTeamAccounts,
  teamAccounts,
  type AccountStatus,
  type TeamAccount,
} from "@/lib/team-accounts";
import { appUrl } from "@/lib/env";
import { assignPrimaryDoulaAction, revokeInviteAction } from "@/app/actions/team";
import { AddTeamMemberDialog } from "@/components/brand/add-team-member-dialog";
import { ProviderAvatar } from "@/components/brand/avatar";
import { SettingsTabs } from "@/components/brand/settings-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const NOTICES: Record<string, { tone: "teal" | "coral"; text: string }> = {
  invite: { tone: "teal", text: "Invite sent. It is queued in the outbox and live for 7 days." },
  revoked: { tone: "teal", text: "Invite withdrawn. That link no longer works." },
  match: { tone: "teal", text: "Primary doula updated for that family." },
  role: { tone: "coral", text: "Only a founder or admin can change the roster." },
  name: { tone: "coral", text: "Add their name so the invite card is not a bare address." },
  email: { tone: "coral", text: "That does not look like an email address." },
  member: { tone: "coral", text: "That person is already in this workspace." },
  duplicate: { tone: "coral", text: "There is already a live invite for that address." },
  client: { tone: "coral", text: "That family is not in your practice." },
  org: { tone: "coral", text: "Sign in again — your workspace could not be read." },
};

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-teal/20 bg-card px-2.5 text-[13px] text-teal-ink focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/25";

const STATUS_CLASS: Record<"teal" | "coral" | "muted", string> = {
  teal: "bg-teal/12 text-teal-ink",
  coral: "bg-coral/12 text-coral",
  muted: "bg-muted text-muted-foreground",
};

function StatusChip({ status }: { status: AccountStatus }) {
  return (
    <Badge variant="secondary" className={STATUS_CLASS[ACCOUNT_STATUS_TONES[status]]}>
      {ACCOUNT_STATUS_LABELS[status]}
    </Badge>
  );
}

/**
 * One person on the team, joined or still deciding. The same card either way — that is
 * the whole point of the grid (TOK-57): a pending doula is a colleague you are waiting
 * on, not a row in a separate table of paperwork.
 */
function TeamAccountCard({
  account,
  manages,
  base,
}: {
  account: TeamAccount;
  manages: boolean;
  base: string;
}) {
  const waiting = account.source === "invite";
  return (
    <article
      className={cn(
        "rounded-xl bg-card p-4 ring-1",
        waiting ? "ring-coral/20" : "ring-teal/15",
      )}
    >
      <div className="flex items-start gap-3">
        <ProviderAvatar
          name={account.name}
          photoFileId={account.photoFileId}
          size={44}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-[14.5px] font-semibold text-teal-ink">
              {account.name}
              {account.credentialsLabel ? (
                <span className="ml-1.5 text-[12px] font-medium text-muted-foreground">
                  {account.credentialsLabel}
                </span>
              ) : null}
            </p>
            <StatusChip status={account.status} />
          </div>
          <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">{account.email}</p>
          <p className="mt-1.5 text-[12.5px] text-muted-foreground">
            {account.roleLabel}
            {account.joinedAt ? ` · joined ${format(account.joinedAt, "MMM yyyy")}` : null}
            {account.expiresAt ? ` · link good through ${format(account.expiresAt, "MMM d")}` : null}
            {account.source === "member" ? ` · ${account.primaryClients} primary` : null}
          </p>
        </div>
      </div>

      {waiting && account.inviteToken ? (
        <div className="mt-3 space-y-2 border-t border-teal/10 pt-3">
          <p className="break-all font-mono text-[11px] leading-snug text-muted-foreground">
            {inviteUrl(base, account.inviteToken)}
          </p>
          {manages && account.inviteId ? (
            <form action={revokeInviteAction}>
              <input type="hidden" name="inviteId" value={account.inviteId} />
              <Button type="submit" size="sm" variant="outline">
                Withdraw invite
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export default async function DoulaTeamPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const query = await searchParams;
  const staff = await requireStaff();
  // TOK-34 D1: this is agency chrome. It is out of the doula shell's nav and search, so
  // a member with role `doula` who deep-links here is sent back to her own practice
  // rather than shown a roster she has no part in running.
  if (!canManageTeam(staff.membershipRole)) redirect("/doula");
  const manages = canManageTeam(staff.membershipRole);
  const [roster, invites, matches] = await Promise.all([
    teamRoster(staff.organizationId),
    orgStaffInvites(staff.organizationId),
    orgMatches(staff.organizationId),
  ]);

  const notice = NOTICES[query.error ?? ""] ?? NOTICES[query.saved ?? ""];
  const base = appUrl();

  // Two grids, one shape: people who work here and families who are carried here, each
  // row carrying whether their account is live or still an unopened invite (TOK-57).
  const accounts = teamAccounts({ members: roster, invites });
  const grouped = groupTeamAccounts(accounts);
  const families = familyAccounts(
    matches.map((row) => ({
      clientId: row.clientId,
      name: row.clientName,
      email: row.email,
      phone: row.phone,
      edd: row.edd,
      city: row.city,
      region: row.region,
      postalCode: row.postalCode,
      serviceType: row.serviceType,
      stage: row.stage,
      primaryDoulaUserId: row.primaryDoulaUserId,
      primaryDoulaName: row.primaryDoulaName,
      access: { status: row.portalStatus, userId: row.portalUserId },
    })),
  );
  const unmatched = families.filter((family) => !family.matched);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-teal">Agency</p>
          <h1 className="mt-1 font-heading text-[28px] font-semibold leading-tight tracking-[-0.02em] text-teal-ink">
            Team
          </h1>
          <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted-foreground">
            Who works here, who is still deciding, and which doula each family belongs to.
            Invites stay live for {INVITE_TTL_DAYS} days.
          </p>
        </div>
        <SettingsTabs />
      </header>

      {notice ? (
        <p
          className={cn(
            "rounded-lg px-3 py-2 text-sm ring-1",
            notice.tone === "coral"
              ? "bg-coral/10 text-coral ring-coral/20"
              : "bg-teal/10 text-teal-ink ring-teal/20",
          )}
        >
          {notice.text}
        </p>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-heading text-xl text-teal-ink">Team member accounts</h2>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              {grouped.active.length} here
              {grouped.pending.length > 0
                ? ` · ${grouped.pending.length} still deciding`
                : null}
              {grouped.expired.length > 0 ? ` · ${grouped.expired.length} lapsed` : null}
            </p>
          </div>
          {manages ? <AddTeamMemberDialog /> : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {grouped.active.map((account) => (
            <TeamAccountCard
              key={account.key}
              account={account}
              manages={manages}
              base={base}
            />
          ))}
        </div>

        {grouped.pending.length > 0 || grouped.expired.length > 0 ? (
          <div className="space-y-2 pt-1">
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Waiting on them
            </p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {[...grouped.pending, ...grouped.expired].map((account) => (
                <TeamAccountCard
                  key={account.key}
                  account={account}
                  manages={manages}
                  base={base}
                />
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-heading text-xl text-teal-ink">Family accounts</h2>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            {families.length} famil{families.length === 1 ? "y" : "ies"}
            {unmatched.length > 0 ? (
              <span className="text-coral"> · {unmatched.length} still without a doula</span>
            ) : null}
            . Matching a doula also puts the family on her Clients list; nobody loses a
            family they already carry.
          </p>
        </div>

        {families.length === 0 ? (
          <p className="rounded-xl bg-card px-5 py-6 text-sm text-muted-foreground ring-1 ring-teal/15">
            No families yet. Share your profile QR or a Book Consult link.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {families.map((family) => (
              <article
                key={family.clientId}
                className={cn(
                  "flex flex-col rounded-xl bg-card p-4 ring-1",
                  family.matched ? "ring-teal/15" : "ring-coral/20",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/doula/clients/${family.clientId}`}
                    className="text-[14.5px] font-semibold text-teal-ink hover:underline"
                  >
                    {family.name}
                  </Link>
                  <StatusChip status={family.portal} />
                </div>
                <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
                  {family.email}
                  {family.phone ? ` · ${family.phone}` : null}
                </p>
                <dl className="mt-2.5 space-y-1 text-[12.5px] text-muted-foreground">
                  {family.location ? (
                    <div className="flex gap-1.5">
                      <dt className="text-teal-ink/70">Lives</dt>
                      <dd>{family.location}</dd>
                    </div>
                  ) : null}
                  {family.edd ? (
                    <div className="flex gap-1.5">
                      <dt className="text-teal-ink/70">Due</dt>
                      <dd>{format(new Date(`${family.edd}T12:00:00`), "MMM d, yyyy")}</dd>
                    </div>
                  ) : null}
                  {family.serviceType ? (
                    <div className="flex gap-1.5">
                      <dt className="text-teal-ink/70">Wants</dt>
                      <dd>{serviceTypeLabel(family.serviceType)}</dd>
                    </div>
                  ) : null}
                  {family.stage ? (
                    <div className="flex gap-1.5">
                      <dt className="text-teal-ink/70">Stage</dt>
                      <dd>{stageLabel(family.stage)}</dd>
                    </div>
                  ) : null}
                </dl>

                <div className="mt-auto pt-3">
                  {manages ? (
                    <form action={assignPrimaryDoulaAction} className="flex items-center gap-2">
                      <input type="hidden" name="clientId" value={family.clientId} />
                      <label className="sr-only" htmlFor={`match-${family.clientId}`}>
                        Primary doula for {family.name}
                      </label>
                      <select
                        id={`match-${family.clientId}`}
                        name="doulaUserId"
                        className={SELECT_CLASS}
                        defaultValue={family.primaryDoulaUserId ?? ""}
                      >
                        <option value="">Nobody yet</option>
                        {roster.map((member) => (
                          <option key={member.userId} value={member.userId}>
                            {member.name} · {roleLabel(member.role)}
                          </option>
                        ))}
                      </select>
                      <Button type="submit" size="sm" variant="outline">
                        Set
                      </Button>
                    </form>
                  ) : (
                    <p className="text-[12.5px] text-muted-foreground">
                      {family.primaryDoulaName ? (
                        <span className="text-teal-ink">With {family.primaryDoulaName}</span>
                      ) : (
                        <span className="text-coral">No doula yet</span>
                      )}
                    </p>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
