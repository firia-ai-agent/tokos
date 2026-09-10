import Link from "next/link";
import { requireStaff } from "@/lib/tenancy";
import { leadBoard, teamRoster } from "@/lib/queries";
import { staffStageFilterLabel, staffStageOptions } from "@/lib/pipeline";
import {
  eddMonthOptions,
  isFiltered,
  leadBoardCounts,
  leadBoardView,
  ownerOptions,
  parseLeadQuery,
} from "@/lib/lead-board";
import {
  NEEDS_ACTION_LEGEND,
  boardTotals,
  pipelineBoardColumns,
} from "@/lib/pipeline-board";
import {
  INSURANCE_OPTIONS,
  LEAD_SOURCE_OPTIONS,
  SERVICE_TYPE_OPTIONS,
  eddMonthLabel,
} from "@/lib/lead-fields";
import {
  agencyBoardSummary,
  clientsEmpty,
  clientsHeading,
  clientsLegend,
  shellPersona,
} from "@/lib/shell-persona";
import { setStageAction } from "@/app/actions/leads";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/brand/states";
import { PipelineBoard } from "@/components/brand/pipeline-board";
import { LeadQueue } from "./lead-queue";
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

/**
 * `/doula/clients` — the pipeline board (TOK-72).
 *
 * The default view is the kanban, filling the work area: Maya's day is moving families
 * along a lifecycle, and the list this replaced could show her who slipped today but
 * never where anyone stood. The two queue tabs keep the list, because "who needs me" is
 * a worklist and the per-row work (log a contact, name an owner, tick reviewed) belongs
 * on a row.
 *
 * The filter row narrows both shapes — three filters up front and the rest behind "More
 * filters", so the chrome above the board is one line rather than three (clutter cuts).
 */
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

  // The lifecycle tab is the board; the queues stay lists.
  const isBoard = query.tab === "all";
  // Every stage gets a column and every card is in one — `count` is the group's own
  // length, so a column header can never disagree with the column under it.
  const columns = pipelineBoardColumns(visible, { persona, now: today });
  const totals = boardTotals(columns);

  // Open the second filter row only when something in it is already narrowing the view,
  // so the board keeps the height rather than the filters.
  const moreFiltersOn = Boolean(
    query.insurance ||
      query.eddMonth ||
      query.owner ||
      query.source ||
      query.overdue ||
      query.unmatched ||
      query.unreviewed,
  );

  return (
    <div
      className={cn(
        "flex flex-col gap-3",
        // The board is the workspace: it takes whatever height is left under the page
        // chrome and scrolls inside itself, rather than growing the page.
        isBoard && "min-h-[calc(100dvh-9.5rem)]",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="font-heading text-2xl text-teal-ink">{clientsHeading(persona)}</h2>
          {/* The columns are the stage legend now, so the agency line carries the one
              fact they cannot: how many families still have nobody named as primary. */}
          <p className="text-sm text-muted-foreground">
            {persona === "agency"
              ? agencyBoardSummary(counts.total, counts.unmatched)
              : clientsLegend(persona)}
          </p>
          <p className="mt-0.5 text-[12.5px] text-teal">
            {totals.families} of {counts.total} shown · {totals.needsAction} need action today ·
            each column sorted by follow-up due, overdue first
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <p className="text-[11.5px] text-muted-foreground">{NEEDS_ACTION_LEGEND}</p>
          {persona === "agency" ? (
            <Link
              href="/doula/clients/import"
              className="rounded-lg bg-coral px-3.5 py-2 text-[13px] font-semibold text-accent-foreground shadow-sm transition hover:bg-coral/90"
            >
              Import leads · CSV
            </Link>
          ) : null}
        </div>
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

      <form className="flex flex-wrap items-end gap-2.5 rounded-xl bg-card p-3 ring-1 ring-teal/15">
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
        {/* The stage words are persona-aware (TOK-49 soft fold): an agency filters a
            pipeline, a doula filters where a family's care stands. One map, in
            `@/lib/pipeline` — never a hardcoded string list in a page. */}
        <FilterSelect
          name="stage"
          label={staffStageFilterLabel(persona)}
          value={query.stage}
          options={staffStageOptions(persona)}
        />
        <FilterSelect
          name="service"
          label="Service"
          value={query.service}
          options={SERVICE_TYPE_OPTIONS}
        />
        <Button type="submit" size="sm" variant="outline">
          Apply
        </Button>
        {isFiltered(query) ? (
          <Link
            href={query.tab === "all" ? "/doula/clients" : `/doula/clients?tab=${query.tab}`}
            className="pb-1 text-[12.5px] font-semibold text-coral hover:underline"
          >
            Clear
          </Link>
        ) : null}

        {/* Hidden fields still post, so a closed panel narrows nothing it is not already
            narrowing — and reopens itself when it is. */}
        <details open={moreFiltersOn} className="w-full">
          <summary className="cursor-pointer text-[12px] font-semibold text-teal">
            More filters
          </summary>
          <div className="mt-2.5 flex flex-wrap items-end gap-2.5">
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
              options={eddMonthOptions(rows).map((key) => ({
                value: key,
                label: eddMonthLabel(key),
              }))}
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
                    <input
                      type="checkbox"
                      name="unmatched"
                      value="1"
                      defaultChecked={query.unmatched}
                    />
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
          </div>
        </details>
      </form>

      {visible.length === 0 ? (
        <EmptyState
          title="Nothing matches those filters"
          body="Clear a filter or widen the search to bring the board back."
        />
      ) : isBoard ? (
        <PipelineBoard columns={columns} action={setStageAction} />
      ) : (
        <LeadQueue rows={visible} persona={persona} roster={roster} today={today} />
      )}
    </div>
  );
}
