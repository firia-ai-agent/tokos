import Link from "next/link";
import { format } from "date-fns";
import { requireStaff } from "@/lib/tenancy";
import { orgMatches, orgStaffInvites, teamRoster } from "@/lib/queries";
import { stageLabel } from "@/lib/pipeline";
import {
  INVITABLE_ROLES,
  INVITE_TTL_DAYS,
  canManageTeam,
  inviteStatus,
  inviteUrl,
  roleLabel,
} from "@/lib/team";
import { appUrl } from "@/lib/env";
import {
  assignPrimaryDoulaAction,
  inviteStaffAction,
  revokeInviteAction,
} from "@/app/actions/team";
import { SettingsTabs } from "@/components/brand/settings-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const NOTICES: Record<string, { tone: "teal" | "coral"; text: string }> = {
  invite: { tone: "teal", text: "Invite sent. It is queued in the outbox and live for 7 days." },
  revoked: { tone: "teal", text: "Invite withdrawn. That link no longer works." },
  match: { tone: "teal", text: "Primary doula updated for that family." },
  role: { tone: "coral", text: "Only a founder or admin can change the roster." },
  email: { tone: "coral", text: "That does not look like an email address." },
  member: { tone: "coral", text: "That person is already in this workspace." },
  duplicate: { tone: "coral", text: "There is already a live invite for that address." },
  client: { tone: "coral", text: "That family is not in your practice." },
  org: { tone: "coral", text: "Sign in again — your workspace could not be read." },
};

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-teal/20 bg-card px-2.5 text-[13px] text-teal-ink focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/25";

export default async function DoulaTeamPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const query = await searchParams;
  const staff = await requireStaff();
  const manages = canManageTeam(staff.membershipRole);
  const [roster, invites, matches] = await Promise.all([
    teamRoster(staff.organizationId),
    orgStaffInvites(staff.organizationId),
    orgMatches(staff.organizationId),
  ]);

  const notice = NOTICES[query.error ?? ""] ?? NOTICES[query.saved ?? ""];
  const now = new Date();
  const pending = invites.filter((invite) => inviteStatus(invite, now) === "pending");
  const lapsed = invites.filter((invite) => inviteStatus(invite, now) === "expired");
  const unmatched = matches.filter((row) => !row.primaryDoulaUserId);
  const base = appUrl();

  const stats = [
    { label: "On the roster", value: roster.length, tone: "ink" as const },
    { label: "Invites pending", value: pending.length, tone: "ink" as const },
    { label: "Families unmatched", value: unmatched.length, tone: "coral" as const },
  ];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-teal">Agency</p>
          <h1 className="mt-1 font-heading text-[28px] font-semibold leading-tight tracking-[-0.02em] text-teal-ink">
            Team
          </h1>
          <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted-foreground">
            Who works here, who is still deciding, and which doula is primary on each
            family. Invites expire after {INVITE_TTL_DAYS} days.
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

      <section className="grid grid-cols-3 gap-3">
        {stats.map((stat) => (
          <article key={stat.label} className="rounded-xl bg-card p-4 ring-1 ring-teal/15">
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {stat.label}
            </p>
            <p
              className={cn(
                "mt-2 font-heading text-[26px] font-semibold leading-none tabular-nums",
                stat.tone === "coral" && stat.value > 0 ? "text-coral" : "text-teal-ink",
              )}
            >
              {stat.value}
            </p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <article className="rounded-xl bg-card ring-1 ring-teal/15">
          <div className="border-b border-teal/10 px-5 py-3.5">
            <h2 className="font-heading text-xl text-teal-ink">Roster</h2>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              Everyone with a membership in this workspace.
            </p>
          </div>
          <ul className="divide-y divide-teal/10">
            {roster.map((member) => (
              <li
                key={member.membershipId}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
              >
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-teal-ink">
                    {member.name}
                    {member.credentialsLabel ? (
                      <span className="ml-1.5 text-[12px] font-medium text-muted-foreground">
                        {member.credentialsLabel}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
                    {member.email} · joined {format(member.joinedAt, "MMM d, yyyy")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[12px] tabular-nums text-muted-foreground">
                    {member.primaryClients} primary
                  </span>
                  <Badge
                    variant="secondary"
                    className={
                      member.role === "doula"
                        ? "bg-teal/12 text-teal-ink"
                        : "bg-teal-ink/90 text-cloud"
                    }
                  >
                    {roleLabel(member.role)}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-xl bg-card ring-1 ring-teal/15">
          <div className="border-b border-teal/10 px-5 py-3.5">
            <h2 className="font-heading text-xl text-teal-ink">Invite a doula</h2>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              They get an email with an accept link. Ownership is not handed out by invite.
            </p>
          </div>
          <div className="px-5 py-4">
            {manages ? (
              <form action={inviteStaffAction} className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="inviteEmail">Work email</Label>
                  <Input
                    id="inviteEmail"
                    name="email"
                    type="email"
                    required
                    placeholder="name@practice.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inviteRole">Role</Label>
                  <select id="inviteRole" name="role" className={SELECT_CLASS} defaultValue="doula">
                    {INVITABLE_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {roleLabel(role)}
                      </option>
                    ))}
                  </select>
                </div>
                <Button type="submit" size="sm">
                  Send invite
                </Button>
              </form>
            ) : (
              <p className="text-[13px] text-muted-foreground">
                Your founder or an admin sends invites. You can see the roster here.
              </p>
            )}
          </div>
        </article>
      </section>

      <section className="rounded-xl bg-card ring-1 ring-teal/15">
        <div className="border-b border-teal/10 px-5 py-3.5">
          <h2 className="font-heading text-xl text-teal-ink">Invites waiting</h2>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            Not accepted yet, not expired. The link is the whole credential — share it only
            with the person it names.
          </p>
        </div>
        {pending.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">
            Nobody is mid-join. {lapsed.length > 0 ? `${lapsed.length} invite${lapsed.length === 1 ? " has" : "s have"} expired.` : "Send one above."}
          </p>
        ) : (
          <ul className="divide-y divide-teal/10">
            {pending.map((invite) => (
              <li
                key={invite.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
              >
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-teal-ink">{invite.email}</p>
                  <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                    {roleLabel(invite.role)} · expires {format(invite.expiresAt, "MMM d")}
                  </p>
                  <p className="mt-1 break-all font-mono text-[11.5px] text-muted-foreground">
                    {inviteUrl(base, invite.token)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="bg-coral/12 text-coral">
                    Pending
                  </Badge>
                  {manages ? (
                    <form action={revokeInviteAction}>
                      <input type="hidden" name="inviteId" value={invite.id} />
                      <Button type="submit" size="sm" variant="outline">
                        Withdraw
                      </Button>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl bg-card ring-1 ring-teal/15">
        <div className="border-b border-teal/10 px-5 py-3.5">
          <h2 className="font-heading text-xl text-teal-ink">Match · primary doula</h2>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            The primary is recorded on the family&apos;s engagement. Matching a doula also
            puts the family on their Clients list; nobody loses a family they already carry.
          </p>
        </div>
        {matches.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">
            No families yet. Share your profile QR or a Book Consult link.
          </p>
        ) : (
          <ul className="divide-y divide-teal/10">
            {matches.map((row) => (
              <li
                key={row.clientId}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
              >
                <div className="min-w-0">
                  <Link
                    href={`/doula/clients/${row.clientId}`}
                    className="text-[14px] font-semibold text-teal-ink hover:underline"
                  >
                    {row.clientName}
                  </Link>
                  <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                    {row.stage ? stageLabel(row.stage) : "No stage"} ·{" "}
                    {row.primaryDoulaName ? (
                      <span className="text-teal-ink">Primary: {row.primaryDoulaName}</span>
                    ) : (
                      <span className="text-coral">No primary yet</span>
                    )}
                  </p>
                </div>
                {manages ? (
                  <form action={assignPrimaryDoulaAction} className="flex items-center gap-2">
                    <input type="hidden" name="clientId" value={row.clientId} />
                    <label className="sr-only" htmlFor={`match-${row.clientId}`}>
                      Primary doula for {row.clientName}
                    </label>
                    <select
                      id={`match-${row.clientId}`}
                      name="doulaUserId"
                      className={cn(SELECT_CLASS, "w-[13rem]")}
                      defaultValue={row.primaryDoulaUserId ?? ""}
                    >
                      <option value="">No primary</option>
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
                  <span className="text-[12.5px] text-muted-foreground">
                    {row.primaryDoulaName ?? "Unassigned"}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
