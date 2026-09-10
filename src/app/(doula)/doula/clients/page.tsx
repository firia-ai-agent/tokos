import Link from "next/link";
import { requireStaff } from "@/lib/tenancy";
import { leadBoard, teamRoster } from "@/lib/queries";
import { stageLabel, PIPELINE_STAGES, STAGE_LABELS } from "@/lib/pipeline";
import {
  eddMonthOptions,
  isFiltered,
  leadBoardCounts,
  leadBoardView,
  ownerOptions,
  parseLeadQuery,
} from "@/lib/lead-board";
import {
  INSURANCE_OPTIONS,
  LEAD_SOURCE_OPTIONS,
  SERVICE_TYPE_OPTIONS,
  eddMonthLabel,
  eddWithWeeks,
  followUpState,
  insuranceLabel,
  lastContactLabel,
  leadSourceLabel,
  serviceTypeLabel,
} from "@/lib/lead-fields";
import { needsAttentionReasons } from "@/lib/needs-attention";
import {
  agencyBoardSummary,
  clientsEmpty,
  clientsHeading,
  clientsLegend,
  shellPersona,
} from "@/lib/shell-persona";
import { logContactAction, setLeadOwnerAction, setReviewedAction } from "@/app/actions/leads";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/brand/states";
import { cn } from "@/lib/utils";

const selectClass =
  "h-8 rounded-md border border-teal/20 bg-card px-2 text-[12.5px] text-teal-ink focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/25";

function FilterSelect({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </span>
      <select name={name} defaultValue={value} className={selectClass}>
        <option value="">All</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaff();
  const params = await searchParams;
  const query = parseLeadQuery(params);

  // TOK-34 D7 / TOK-49: an owner/admin is looking at the practice, so the board is
  // org-wide and includes families nobody is on yet. A doula sees the same board narrowed
  // to her assignments — one query, two scopes, rather than two lists that drift.
  const persona = shellPersona(staff.membershipRole);
  const [rows, roster] = await Promise.all([
    leadBoard(staff.organizationId, persona === "agency" ? {} : { doulaUserId: staff.userId }),
    teamRoster(staff.organizationId),
  ]);

  const today = new Date();
  const counts = leadBoardCounts(rows, today);
  const visible = leadBoardView(rows, query, today);
  const nameOf = new Map(roster.map((member) => [member.userId, member.name]));

  if (rows.length === 0) {
    const empty = clientsEmpty(persona);
    return <EmptyState title={empty.title} body={empty.body} />;
  }

  const tabs: Array<{ key: string; label: string; count: number }> = [
    { key: "all", label: persona === "agency" ? "Pipeline" : "All", count: counts.total },
    { key: "attention", label: "Needs attention", count: counts.attention },
    ...(persona === "agency"
      ? [{ key: "unmatched", label: "Unmatched", count: counts.unmatched }]
      : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-2xl text-teal-ink">{clientsHeading(persona)}</h2>
          <p className="text-sm text-muted-foreground">{clientsLegend(persona)}</p>
          {persona === "agency" ? (
            <p className="mt-1 text-[13px] font-medium text-teal">
              {agencyBoardSummary(counts.total, counts.unmatched)}
            </p>
          ) : null}
        </div>
        {persona === "agency" ? (
          <Link
            href="/doula/clients/import"
            className="rounded-lg bg-coral px-3.5 py-2 text-[13px] font-semibold text-accent-foreground shadow-sm transition hover:bg-coral/90"
          >
            Import leads · CSV
          </Link>
        ) : null}
      </div>

      {/* Tabs are links, not dead text: "N without a primary doula" was the loudest piece
          of that feedback (TOK-49). */}
      <nav className="flex flex-wrap gap-1.5">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.key === "all" ? "/doula/clients" : `/doula/clients?tab=${tab.key}`}
            className={cn(
              "rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition",
              query.tab === tab.key
                ? "bg-teal-ink text-cloud"
                : "bg-teal/10 text-teal-ink hover:bg-teal/20",
            )}
          >
            {tab.label} · {tab.count}
          </Link>
        ))}
      </nav>

      <form className="flex flex-wrap items-end gap-2.5 rounded-xl bg-card p-3.5 ring-1 ring-teal/15">
        <input type="hidden" name="tab" value={query.tab} />
        <label className="flex flex-col gap-1">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Search
          </span>
          <input
            name="q"
            defaultValue={query.q}
            placeholder="Name, email, phone"
            className="h-8 w-52 rounded-md border border-teal/20 bg-card px-2.5 text-[12.5px] text-teal-ink focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/25"
          />
        </label>
        <FilterSelect
          name="stage"
          label="Stage"
          value={query.stage}
          options={PIPELINE_STAGES.map((stage) => ({ value: stage, label: STAGE_LABELS[stage] }))}
        />
        <FilterSelect
          name="service"
          label="Service"
          value={query.service}
          options={SERVICE_TYPE_OPTIONS}
        />
        <FilterSelect
          name="insurance"
          label="Insurance"
          value={query.insurance}
          options={INSURANCE_OPTIONS}
        />
        <FilterSelect
          name="eddMonth"
          label="EDD month"
          value={query.eddMonth}
          options={eddMonthOptions(rows).map((key) => ({ value: key, label: eddMonthLabel(key) }))}
        />
        {/* Owner and source are agency analytics — a doula's board never carries them. */}
        {persona === "agency" ? (
          <>
            <FilterSelect
              name="owner"
              label="Owner"
              value={query.owner}
              options={ownerOptions(rows, (id) => nameOf.get(id) ?? null)}
            />
            <FilterSelect
              name="source"
              label="Source"
              value={query.source}
              options={LEAD_SOURCE_OPTIONS}
            />
          </>
        ) : null}
        <div className="flex flex-wrap items-center gap-3 pb-1 text-[12.5px] text-teal-ink">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" name="overdue" value="1" defaultChecked={query.overdue} />
            Overdue follow-up
          </label>
          {persona === "agency" ? (
            <>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" name="unmatched" value="1" defaultChecked={query.unmatched} />
                No primary doula
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  name="unreviewed"
                  value="1"
                  defaultChecked={query.unreviewed}
                />
                Unreviewed
              </label>
            </>
          ) : null}
        </div>
        <Button type="submit" size="sm" variant="outline">
          Apply
        </Button>
        {isFiltered(query) ? (
          <Link
            href="/doula/clients"
            className="pb-1 text-[12.5px] font-semibold text-coral hover:underline"
          >
            Clear
          </Link>
        ) : null}
      </form>

      <p className="text-[12.5px] text-muted-foreground">
        {visible.length} of {counts.total} · sorted by follow-up due, overdue first
      </p>

      {visible.length === 0 ? (
        <EmptyState
          title="Nothing matches those filters"
          body="Clear a filter or widen the search to bring the board back."
        />
      ) : null}

      <div className="grid gap-2">
        {visible.map((row) => {
          const { client } = row;
          const follow = followUpState(client.followUpDueOn, today);
          const reasons = needsAttentionReasons(
            {
              clientId: client.id,
              name: client.displayName,
              stage: row.stage,
              followUpDueOn: client.followUpDueOn,
              reviewed: client.reviewed,
              hasPrimaryDoula: Boolean(row.primaryDoulaUserId),
              stageEnteredAt: row.stageEnteredAt,
              lastNoteAt: row.lastNoteAt,
            },
            today,
          );
          const edd = eddWithWeeks(client.edd, today);

          return (
            <article key={client.id} className="rounded-xl bg-card p-3.5 ring-1 ring-teal/15">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/doula/clients/${client.id}`}
                    className="font-heading text-[16px] font-semibold text-teal-ink hover:underline"
                  >
                    {client.displayName}
                  </Link>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-muted-foreground">
                    {serviceTypeLabel(client.serviceType) ? (
                      <span>{serviceTypeLabel(client.serviceType)}</span>
                    ) : null}
                    {edd ? <span>· {edd}</span> : null}
                    <span>· {lastContactLabel(client.lastContactAt, today)}</span>
                    <span>· {insuranceLabel(client.insurance)}</span>
                    {persona === "agency" ? (
                      <>
                        <span>· {leadSourceLabel(client.source)}</span>
                        <span>
                          ·{" "}
                          {client.ownerUserId
                            ? `Owner: ${nameOf.get(client.ownerUserId) ?? "Unknown"}`
                            : "No owner"}
                        </span>
                      </>
                    ) : null}
                    <span>
                      ·{" "}
                      {row.primaryDoulaName
                        ? `Primary: ${row.primaryDoulaName}`
                        : "No primary doula"}
                    </span>
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <Badge>{stageLabel(row.stage)}</Badge>
                  <span
                    className={cn(
                      "text-[12px] font-semibold",
                      follow.state === "overdue"
                        ? "text-coral"
                        : follow.state === "today"
                          ? "text-teal"
                          : "text-muted-foreground",
                    )}
                  >
                    {follow.label}
                  </span>
                </div>
              </div>

              {reasons.length > 0 ? (
                <p className="mt-2 text-[11.5px] font-semibold text-coral">
                  {reasons.map((reason) => reason.label).join(" · ")}
                </p>
              ) : null}

              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                {/* Two taps: this button and the row. Anything longer and Last Contact
                    rots, and Needs Attention rots with it. */}
                <form action={logContactAction}>
                  <input type="hidden" name="clientId" value={client.id} />
                  <Button type="submit" size="sm" variant="ghost">
                    Log contact
                  </Button>
                </form>
                {persona === "agency" ? (
                  <>
                    <form action={setLeadOwnerAction} className="flex items-center gap-1.5">
                      <input type="hidden" name="clientId" value={client.id} />
                      <label className="sr-only" htmlFor={`owner-${client.id}`}>
                        Owner for {client.displayName}
                      </label>
                      <select
                        id={`owner-${client.id}`}
                        name="ownerUserId"
                        defaultValue={client.ownerUserId ?? ""}
                        className={selectClass}
                      >
                        <option value="">No owner</option>
                        {roster.map((member) => (
                          <option key={member.userId} value={member.userId}>
                            {member.name}
                          </option>
                        ))}
                      </select>
                      <Button type="submit" size="sm" variant="ghost">
                        Set
                      </Button>
                    </form>
                    <form action={setReviewedAction}>
                      <input type="hidden" name="clientId" value={client.id} />
                      <input
                        type="hidden"
                        name="reviewed"
                        value={client.reviewed ? "no" : "yes"}
                      />
                      <Button
                        type="submit"
                        size="sm"
                        variant={client.reviewed ? "ghost" : "outline"}
                      >
                        {client.reviewed ? "Reviewed ✓" : "Mark reviewed"}
                      </Button>
                    </form>
                  </>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
