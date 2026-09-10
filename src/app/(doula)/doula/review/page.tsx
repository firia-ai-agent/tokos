import Link from "next/link";
import { requireStaff } from "@/lib/tenancy";
import { needsAttentionQueue } from "@/lib/queries";
import { staffStageLabel } from "@/lib/pipeline";
import { homeCtaLabel, shellPersona } from "@/lib/shell-persona";
import { reviewBoard, reviewQueueSummary, reviewTaskCount } from "@/lib/home-queues";
import { NEEDS_ACTION_EDGE } from "@/lib/home-density";
import { EmptyState } from "@/components/brand/states";
import { cn } from "@/lib/utils";

/**
 * The review board (TOK-52) — where "N items need your review" lands.
 *
 * Home's Needs attention card is a glance: six names and what is wrong with them. This is
 * the working surface: every open family, every rule she tripped, and a link per rule to
 * the part of her record that clears it. The rules are `@/lib/needs-attention`, the same
 * ones Home and the leads tab read, so the number in the greeting and the rows here can
 * never disagree.
 *
 * An agency sees the practice; an assigned doula sees her own families (TOK-34).
 */
export default async function DoulaReviewPage() {
  const staff = await requireStaff();
  const persona = shellPersona(staff.membershipRole);
  const attention = await needsAttentionQueue(
    staff.organizationId,
    persona === "agency" ? {} : { doulaUserId: staff.userId },
  );
  const rows = reviewBoard(attention);
  const tasks = reviewTaskCount(attention);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-teal">
            Your review
          </p>
          <h1 className="mt-1 font-heading text-[28px] font-semibold tracking-[-0.02em] text-teal-ink">
            {reviewQueueSummary(rows.length)}
          </h1>
          <p className="mt-1.5 text-[14.5px] text-muted-foreground">
            {rows.length === 0
              ? "Nothing is overdue, unmatched, or unread."
              : `${tasks} thing${tasks === 1 ? "" : "s"} to do, worst first. Each one opens the part of the record that clears it.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/doula/clients?tab=attention"
            className="rounded-lg bg-cloud px-3.5 py-2 text-[13px] font-semibold text-teal-ink ring-1 ring-teal/20 transition hover:ring-teal/45"
          >
            See them on the board
          </Link>
          <Link
            href="/doula/clients"
            className="rounded-lg bg-coral px-3.5 py-2 text-[13px] font-semibold text-accent-foreground shadow-sm transition hover:bg-coral/90"
          >
            {homeCtaLabel(persona)}
          </Link>
        </div>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          title="Your review is clear"
          body="Every open family has a follow-up date, a primary doula, a consult note, and a review. New work lands here on its own."
        />
      ) : (
        <ol className="grid gap-3">
          {rows.map((row) => (
            <li key={row.clientId}>
              <article
                className={cn(
                  "rounded-xl bg-card ring-1 ring-teal/15",
                  // Same terracotta edge Home draws (TOK-52 density): every row on this
                  // board is, by definition, a family that needs action today.
                  NEEDS_ACTION_EDGE,
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-teal/10 px-5 py-3.5">
                  <Link
                    href={row.href}
                    className="font-heading text-[17px] font-semibold text-teal-ink hover:underline"
                  >
                    {row.name}
                  </Link>
                  <span className="shrink-0 rounded-md bg-teal/10 px-2.5 py-1 text-[11.5px] font-semibold text-teal-ink">
                    {staffStageLabel(persona, row.stage)}
                  </span>
                </div>

                {/* One line per rule. The reason on the left, the fix on the right —
                    the whole point of the board is that nothing here is a dead end. */}
                <ul className="divide-y divide-teal/10">
                  {row.tasks.map((task) => (
                    <li key={task.key}>
                      <Link
                        href={task.href}
                        className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 transition hover:bg-cloud"
                      >
                        <span className="text-[13.5px] font-semibold text-coral">
                          {task.label}
                        </span>
                        <span className="text-[13px] font-semibold text-teal">
                          {task.action} →
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-teal/10 bg-cloud px-5 py-2.5">
                  {row.surfaces.map((surface) => (
                    <Link
                      key={surface.href}
                      href={surface.href}
                      className="text-[12.5px] font-semibold text-teal-ink/70 underline-offset-2 hover:text-teal-ink hover:underline"
                    >
                      {surface.label}
                    </Link>
                  ))}
                </div>
              </article>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
