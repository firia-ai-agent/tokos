import Link from "next/link";
import { staffStageLabel } from "@/lib/pipeline";
import type { ShellPersona } from "@/lib/shell-persona";
import type { LeadBoardRow } from "@/lib/queries";
import { attentionInput } from "@/lib/queries";
import {
  eddWithWeeks,
  followUpState,
  insuranceLabel,
  lastContactLabel,
  leadSourceLabel,
  serviceTypeLabel,
} from "@/lib/lead-fields";
import { needsAttentionReasons } from "@/lib/needs-attention";
import { logContactAction, setLeadOwnerAction, setReviewedAction } from "@/app/actions/leads";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The queue list (TOK-49), now the shape of the two queue tabs rather than the whole page.
 *
 * TOK-72 turned the Pipeline tab into a kanban, because that is the shape of "move this
 * family along". Needs attention and Unmatched are not that question — they are worklists
 * ordered worst-first, and the per-row work they carry (log a contact, name an owner,
 * tick reviewed) belongs on a row and would be chrome on a card. So the lifecycle gets
 * columns and the queues keep the list, rather than one shape pretending to be both.
 */
export function LeadQueue({
  rows,
  persona,
  roster,
  today,
}: {
  rows: readonly LeadBoardRow[];
  persona: ShellPersona;
  roster: ReadonlyArray<{ userId: string; name: string }>;
  today: Date;
}) {
  const nameOf = new Map(roster.map((member) => [member.userId, member.name]));
  const selectClass =
    "h-8 rounded-md border border-teal/20 bg-card px-2 text-[12.5px] text-teal-ink focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/25";

  return (
    <div className="grid gap-2">
      {rows.map((row) => {
        const { client } = row;
        const follow = followUpState(client.followUpDueOn, today);
        // The rules see the same row the bell and Home see — including the money and the
        // TOK-58 counts, which a hand-built input here used to drop on the floor.
        const reasons = needsAttentionReasons(attentionInput(row), today);
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
                <Badge>{staffStageLabel(persona, row.stage)}</Badge>
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
                    <input type="hidden" name="reviewed" value={client.reviewed ? "no" : "yes"} />
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
  );
}
