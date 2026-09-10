import Link from "next/link";
import { requireClient } from "@/lib/tenancy";
import { resolveAssignedDoulaName } from "@/lib/assigned-doula";
import { bookClientConsultAction } from "@/app/actions/client";
import {
  SLOT_REJECTION_MESSAGES,
  clientVisitLabel,
  durationMinutes,
  formatDayHeading,
  formatDuration,
  formatSlotTime,
  groupByDay,
  listClientConsults,
  listOpenSlots,
  organizationTimezone,
  timezoneLabel,
  type SlotRejection,
} from "@/lib/calendar";
import {
  bucketByDay,
  monthGrid,
  monthKey,
  openSlotsByDay,
  shiftMonthKey,
  visitPlace,
} from "@/lib/calendar-grid";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/brand/states";
import { SlotPicker } from "@/components/brand/slot-picker";
import { CalendarFrame, DayChip, MonthGrid } from "@/components/brand/calendar-grid";
import { cn } from "@/lib/utils";

function rejectionMessage(error?: string) {
  if (!error) return null;
  return (
    SLOT_REJECTION_MESSAGES[error as SlotRejection] ??
    "We could not book that window. Pick another one."
  );
}

/** How many previous visits stay on screen before the page starts hiding history. */
const PREVIOUS_SHOWN = 6;

export default async function PortalCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; month?: string }>;
}) {
  const session = await requireClient();
  const query = await searchParams;
  const now = new Date();
  // Both halves: what is still ahead, and the visits already behind them — a calendar
  // that forgets everything the moment it happens is a to-do list (TOK-54).
  const { upcoming, past } = await listClientConsults({
    organizationId: session.organizationId,
    clientId: session.clientId,
    now,
  });
  const timeZone = await organizationTimezone(session.organizationId);
  // The same resolve the rest of the portal uses, so the calendar you book on belongs to
  // the doula the portal names — and the read is org-scoped (TOK-38).
  const doula = await resolveAssignedDoulaName({
    organizationId: session.organizationId,
    clientId: session.clientId,
  });

  const slots = doula.userId
    ? await listOpenSlots({
        organizationId: session.organizationId,
        userId: doula.userId,
        from: now,
      })
    : [];
  const error = rejectionMessage(query.error);
  // Nobody assigned yet and no open windows read the same to a family: there is no time
  // to pick, and the next move is a message rather than a refresh (TOK-33 C3).
  const canBook = Boolean(doula.userId) && slots.length > 0;

  const anchorMonth = query.month ?? monthKey(now, timeZone);
  const grid = monthGrid({ month: anchorMonth, timeZone, now });
  const visitsByDay = bucketByDay([...past, ...upcoming], timeZone);
  // Only the days a family could actually take. `listOpenSlots` already stops at the
  // booking horizon and already drops the days the doula is away.
  const openByDay = openSlotsByDay(slots, timeZone);

  const monthHref = (month: string) =>
    `/portal/calendar?month=${month}${query.error ? `&error=${query.error}` : ""}`;

  return (
    <div className="space-y-5">
      <header>
        <h2 className="font-heading text-2xl text-teal-ink">Your visits with {doula.firstName}</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Everything on the calendar with {doula.firstName}, and the times she has open. All times{" "}
          {timezoneLabel(now, timeZone)}.
        </p>
      </header>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(280px,1fr)]">
        <CalendarFrame
          label={grid.label}
          sublabel={`Booked visits and ${doula.firstName}'s open times`}
          prevHref={monthHref(shiftMonthKey(grid.anchor, -1))}
          nextHref={monthHref(shiftMonthKey(grid.anchor, 1))}
          todayHref={monthHref(monthKey(now, timeZone))}
        >
          <MonthGrid
            grid={grid}
            compact
            renderDay={(day) => {
              const dayVisits = visitsByDay.get(day.key) ?? [];
              const open = day.isPast ? 0 : (openByDay.get(day.key) ?? 0);
              return (
                <div className="flex flex-1 flex-col gap-0.5">
                  {/* Time only in a cell this narrow — the type and the place are spelled
                      out on the card beside it, and a truncated "Introductory con…" is
                      worse than the hour someone is scanning for. */}
                  {dayVisits.map((visit) => (
                    <DayChip
                      key={visit.id}
                      label={formatSlotTime(visit.startsAt, timeZone)}
                      tone={day.isPast ? "ink" : "teal"}
                    />
                  ))}
                  {open > 0 ? (
                    <span className="mt-auto px-1.5 text-[10.5px] font-medium text-teal/70">
                      {open} open
                    </span>
                  ) : null}
                </div>
              );
            }}
          />
          <p className="text-[12px] text-muted-foreground">
            Teal is a visit that is booked. &ldquo;Open&rdquo; is a time {doula.firstName} has
            free — pick one on the right.
          </p>
        </CalendarFrame>

        <div className="space-y-5">
          <section className="space-y-3">
            <h3 className="text-sm font-medium">Coming up</h3>
            {upcoming.length === 0 ? (
              <EmptyState
                title="No visits yet"
                body={`Choose a time that works with ${doula.firstName}.`}
              />
            ) : (
              <div className="space-y-4">
                {groupByDay(upcoming, timeZone, now).map((day) => (
                  <div key={day.key} className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-teal">
                      {day.label}
                    </p>
                    {day.items.map((event) => {
                      const place = visitPlace(event.locationLabel);
                      return (
                        <div key={event.id} className="rounded-xl border bg-card p-4">
                          <p className="font-heading text-lg text-teal-ink">
                            {formatSlotTime(event.startsAt, timeZone)}
                          </p>
                          {/* Who, how long, which clock, what it is — the four things a
                              family needs before they can plan around a visit (C4). */}
                          <p className="mt-1 text-sm text-muted-foreground">
                            with {doula.firstName} ·{" "}
                            {formatDuration(durationMinutes(event.startsAt, event.endsAt))} ·{" "}
                            {timezoneLabel(event.startsAt, timeZone)} ·{" "}
                            {clientVisitLabel({ title: event.title, type: event.type })}
                          </p>
                          {/* A meeting URL is the one thing on this card someone needs to
                              press. A place name is not a link and never pretends to be. */}
                          {place ? (
                            place.kind === "link" ? (
                              <a
                                href={place.url}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-2 inline-block rounded-lg bg-teal px-3 py-1.5 text-[12.5px] font-semibold text-cloud transition-colors hover:bg-teal-ink"
                              >
                                {place.label}
                              </a>
                            ) : (
                              <p className="mt-1 text-sm text-muted-foreground">{place.label}</p>
                            )
                          ) : null}
                          <Link
                            href="/portal/messages"
                            className="mt-3 inline-block text-sm font-medium text-teal underline underline-offset-4"
                          >
                            Message {doula.firstName} to change
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium">Book with {doula.firstName}</h3>
            {canBook ? (
              <form action={bookClientConsultAction} className="space-y-4">
                <input type="hidden" name="assigneeUserId" value={doula.userId ?? ""} />
                <SlotPicker slots={slots} timeZone={timeZone} now={now} />
                <Button type="submit">Book this time</Button>
              </form>
            ) : (
              <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
                {doula.firstName} hasn&rsquo;t opened times yet —{" "}
                <Link
                  href="/portal/messages"
                  className="font-medium text-teal underline underline-offset-4"
                >
                  message {doula.firstName}
                </Link>
                .
              </p>
            )}
          </section>
        </div>
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-medium">Previous visits</h3>
        {past.length === 0 ? (
          <p className="rounded-xl bg-cloud px-4 py-3 text-sm text-muted-foreground">
            Once you have met with {doula.firstName}, those visits stay here.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {past.slice(0, PREVIOUS_SHOWN).map((event) => {
              const place = visitPlace(event.locationLabel);
              const cancelled = event.status !== "scheduled";
              return (
                <li
                  key={event.id}
                  className="rounded-xl bg-cloud px-3.5 py-2.5 ring-1 ring-teal/12"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-teal">
                    {formatDayHeading(event.startsAt, timeZone, now)}
                  </p>
                  <p className="mt-0.5 text-[13.5px] font-semibold text-teal-ink">
                    {formatSlotTime(event.startsAt, timeZone)} ·{" "}
                    {clientVisitLabel({ title: event.title, type: event.type })}
                  </p>
                  <p
                    className={cn(
                      "mt-0.5 text-[12px]",
                      cancelled ? "text-coral" : "text-muted-foreground",
                    )}
                  >
                    {cancelled
                      ? "Did not happen"
                      : `with ${doula.firstName} · ${formatDuration(
                          durationMinutes(event.startsAt, event.endsAt),
                        )}`}
                  </p>
                  {place ? (
                    <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                      {place.kind === "link" ? place.label.replace(/^Join /, "") : place.label}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
