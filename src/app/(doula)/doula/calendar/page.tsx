import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { availability, providerProfiles } from "@/db/schema";
import {
  BOOKING_HORIZON_DAYS,
  availabilityErrorMessage,
  clientVisitLabel,
  dayKey,
  durationMinutes,
  formatDuration,
  formatDayHeading,
  formatSlotTime,
  groupByDay,
  listOpenSlots,
  listSchedule,
  organizationTimezone,
  timezoneLabel,
  type ScheduleEntry,
  type Slot,
  type WindowsErrorCode,
} from "@/lib/calendar";
import {
  bucketByDay,
  coversWholeDay,
  formatTimeOffSpan,
  monthGrid,
  monthKey,
  openSlotsByDay,
  shiftDayKey,
  shiftMonthKey,
  visitPlace,
  weekGrid,
  type CalendarDay,
} from "@/lib/calendar-grid";
import { appUrl } from "@/lib/env";
import { requireStaff } from "@/lib/tenancy";
import {
  removeTimeOffAction,
  saveAvailabilityAction,
  saveTimeOffAction,
} from "@/app/actions/doula";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/brand/states";
import { AvailabilityWeekGrid } from "@/components/brand/availability-week-grid";
import { CalendarFrame, DayChip, MonthGrid } from "@/components/brand/calendar-grid";
import { CopyLink } from "@/components/brand/copy-link";
import { cn } from "@/lib/utils";

const SELECT_CLASS =
  "h-8 rounded-lg border border-input bg-transparent px-2 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const VIEWS = ["month", "week", "upcoming", "settings"] as const;
type View = (typeof VIEWS)[number];

/** How many chips fit in a month cell before the rest collapse into a count. */
const CHIPS_PER_CELL = 3;

/** Open hours spelled out per week-view column before the rest collapse into a count. */
const WEEK_OPEN_CHIPS = 6;

/** How much of "next up" and "away" the rail beside the month carries. */
const RAIL_VISIT_COUNT = 3;

const WEEKDAY_ABBREVIATIONS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** What a day off does to one day: closes it outright, or takes a span out of it. */
type DayTimeOff = { closed: boolean; partial: ScheduleEntry[] };

/** What a redirect after a save is telling the doula. */
const SAVED_MESSAGES: Record<string, string> = {
  windows: "Weekly schedule saved. Families book against it from now on.",
  "time-off": "Blocked. Nobody can book that time.",
  "time-off-removed": "Unblocked. Your weekly windows are open on those hours again.",
};

type Query = {
  view?: string;
  month?: string;
  day?: string;
  saved?: string;
  error?: string;
  weekday?: string;
};

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const staff = await requireStaff();
  const db = getDb();
  const now = new Date();
  const query = await searchParams;
  const rules = await db
    .select()
    .from(availability)
    .where(
      and(
        eq(availability.organizationId, staff.organizationId),
        eq(availability.userId, staff.userId),
      ),
    );
  // The Tokos calendar is the system of record, so "my schedule" reads through
  // listSchedule rather than re-querying calendar_events here.
  const { upcoming, past, timeOff } = await listSchedule({
    organizationId: staff.organizationId,
    userId: staff.userId,
    now,
  });
  const timeZone = await organizationTimezone(staff.organizationId);
  // What a family would actually see if they opened the booking page right now — the
  // windows minus everything already booked and every day off (C11).
  const openForFamilies = await listOpenSlots({
    organizationId: staff.organizationId,
    userId: staff.userId,
    from: now,
  });
  const [profile] = await db
    .select({ slug: providerProfiles.slug })
    .from(providerProfiles)
    .where(
      and(
        eq(providerProfiles.organizationId, staff.organizationId),
        eq(providerProfiles.userId, staff.userId),
      ),
    )
    .limit(1);
  const zone = timezoneLabel(now, timeZone);

  const view: View = VIEWS.includes(query.view as View) ? (query.view as View) : "month";
  const anchorMonth = query.month ?? monthKey(now, timeZone);
  const anchorDay = query.day ?? dayKey(now, timeZone);
  const grid = view === "week"
    ? weekGrid({ day: anchorDay, timeZone, now })
    : monthGrid({ month: anchorMonth, timeZone, now });

  // Past visits belong on the grid too — a month with only its future filled in is the
  // same empty skeleton the ticket is replacing.
  const visits = [...past, ...upcoming].sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
  );
  const visitsByDay = bucketByDay(visits, timeZone);
  const timeOffByDay = bucketByDay(timeOff, timeZone);
  // A 1–2pm block closes an hour, not a Tuesday (TOK-78). The grid greys a day out only
  // when a block covers it end to end; a partial block shows as the span it actually is,
  // and the open-window counts beside it already have the hour subtracted.
  const dayTimeOff = (day: CalendarDay) => {
    const entries = timeOffByDay.get(day.key) ?? [];
    return {
      closed: entries.some((entry) => coversWholeDay(entry, day)),
      partial: entries.filter((entry) => !coversWholeDay(entry, day)),
    };
  };

  // Open windows across the days actually on screen, so a cell can say what is still
  // bookable rather than only what is taken.
  const gridStart = grid.days[0]?.startsAt ?? now;
  const openOnGrid = await listOpenSlots({
    organizationId: staff.organizationId,
    userId: staff.userId,
    from: gridStart,
    days: grid.days.length,
  });
  const openByDay = openSlotsByDay(openOnGrid, timeZone);
  const openSlotsOnDay = bucketByDay(openOnGrid, timeZone);

  // The stat counts what is actually on screen, so switching to a week does not leave a
  // month's number sitting above a week's grid.
  const shownDays = view === "week" ? grid.days : grid.days.filter((day) => day.inMonth);
  const shownVisits = shownDays.flatMap((day) => visitsByDay.get(day.key) ?? []);
  const bookingUrl = `${appUrl()}/p/${profile?.slug ?? ""}/book`;

  const href = (patch: Partial<Query>) => {
    const params = new URLSearchParams();
    const next = { view, month: anchorMonth, day: anchorDay, ...patch };
    if (next.view && next.view !== "month") params.set("view", next.view);
    if (next.month) params.set("month", next.month);
    if (next.day) params.set("day", next.day);
    const qs = params.toString();
    return qs ? `/doula/calendar?${qs}` : "/doula/calendar";
  };

  const nextVisit = upcoming[0];
  const windowsError = (["unreadable", "order", "overlap"] as const).includes(
    query.error as WindowsErrorCode,
  )
    ? (query.error as WindowsErrorCode)
    : null;
  const savedMessage = query.saved ? SAVED_MESSAGES[query.saved] : undefined;

  return (
    <div className="space-y-4">
      <header className="rounded-xl bg-cloud p-4 ring-1 ring-teal/12">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-teal">
              {grid.label}
            </p>
            <h2 className="mt-0.5 font-heading text-[26px] leading-tight text-teal-ink">Calendar</h2>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              Your practice&rsquo;s clock — {timeZone} ({zone}).
            </p>
          </div>
          <dl className="flex flex-wrap items-stretch gap-2">
            <Stat
              label={view === "week" ? "Visits this week" : "Visits this month"}
              value={String(shownVisits.length)}
            />
            <Stat
              label={`Open windows · ${BOOKING_HORIZON_DAYS}d`}
              value={String(openForFamilies.length)}
              tone={openForFamilies.length === 0 ? "coral" : "teal"}
            />
            <Stat
              label="Next visit"
              value={
                nextVisit
                  ? `${formatSlotTime(nextVisit.startsAt, timeZone)} · ${
                      nextVisit.clientName ?? clientVisitLabel({ title: nextVisit.title, type: nextVisit.type })
                    }`
                  : "Nothing booked"
              }
              wide
            />
          </dl>
        </div>
        {/* The share affordance a doula actually uses every week: the link families book
            through, next to the page it opens. */}
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-teal/12 pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-teal">
            Booking link
          </p>
          <div className="min-w-[280px] flex-1">
            <CopyLink url={bookingUrl} label="Your booking link" />
          </div>
          <Link
            href={`/p/${profile?.slug ?? ""}/book`}
            className="text-[12.5px] font-semibold text-teal underline underline-offset-4"
          >
            Open book page
          </Link>
        </div>
      </header>

      <nav className="flex flex-wrap items-center gap-1" aria-label="Calendar views">
        <ViewTab href={href({ view: "month" })} label="Calendar" active={view === "month" || view === "week"} />
        <ViewTab
          href={href({ view: "upcoming" })}
          label={`Upcoming${upcoming.length ? ` · ${upcoming.length}` : ""}`}
          active={view === "upcoming"}
        />
        <ViewTab href={href({ view: "settings" })} label="Settings" active={view === "settings"} />
      </nav>

      {query.error === "time-off" ? (
        <Alert variant="destructive">
          <AlertDescription>
            That did not read as a block of time. Pick a date, and an end that comes after
            the start — or leave the times blank for the whole day.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* A refused week says which day and what is wrong with it, because "invalid" tells
          a doula nothing about the Wednesday she has to go fix. */}
      {windowsError ? (
        <Alert variant="destructive">
          <AlertDescription>
            {availabilityErrorMessage(
              windowsError,
              query.weekday === undefined ? undefined : Number(query.weekday),
            )}
          </AlertDescription>
        </Alert>
      ) : null}

      {savedMessage ? (
        <Alert>
          <AlertDescription>{savedMessage}</AlertDescription>
        </Alert>
      ) : null}

      {view === "month" || view === "week" ? (
        <CalendarFrame
          label={grid.label}
          sublabel={`All times ${zone}`}
          prevHref={
            view === "week"
              ? href({ day: shiftDayKey(grid.anchor, -7, timeZone) })
              : href({ month: shiftMonthKey(grid.anchor, -1) })
          }
          nextHref={
            view === "week"
              ? href({ day: shiftDayKey(grid.anchor, 7, timeZone) })
              : href({ month: shiftMonthKey(grid.anchor, 1) })
          }
          todayHref={href({ month: monthKey(now, timeZone), day: dayKey(now, timeZone) })}
          actions={
            <div className="flex items-center gap-1 rounded-lg bg-cloud p-0.5 ring-1 ring-teal/15">
              <ViewToggle href={href({ view: "month" })} label="Month" active={view === "month"} />
              <ViewToggle href={href({ view: "week" })} label="Week" active={view === "week"} />
            </div>
          }
        >
          {view === "month" ? (
            <div className="grid gap-3 xl:grid-cols-[minmax(0,3.1fr)_minmax(212px,1fr)]">
              <MonthGrid
                grid={grid}
                renderDay={(day) => (
                  <MonthCellBody
                    day={day}
                    visits={visitsByDay.get(day.key) ?? []}
                    off={dayTimeOff(day)}
                    openCount={day.isPast ? 0 : (openByDay.get(day.key) ?? 0)}
                    timeZone={timeZone}
                  />
                )}
              />
              <CalendarRail
                upcoming={upcoming}
                timeOff={timeOff}
                timeZone={timeZone}
                settingsHref={href({ view: "settings" })}
                upcomingHref={href({ view: "upcoming" })}
              />
            </div>
          ) : (
            <WeekColumns
              days={grid.days}
              visitsByDay={visitsByDay}
              dayTimeOff={dayTimeOff}
              openSlotsOnDay={openSlotsOnDay}
              timeZone={timeZone}
            />
          )}
          <p className="text-[12px] text-muted-foreground">
            {openForFamilies.length > 0
              ? `Families see ${openForFamilies.length} open ${
                  openForFamilies.length === 1 ? "window" : "windows"
                } over the next ${BOOKING_HORIZON_DAYS} days.`
              : `Families see no open windows over the next ${BOOKING_HORIZON_DAYS} days.`}
          </p>
        </CalendarFrame>
      ) : null}

      {view === "upcoming" ? (
        <Card>
          <CardHeader>
            <CardTitle>Upcoming visits</CardTitle>
            <CardDescription>All times {zone}.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {upcoming.length === 0 ? (
              <EmptyState
                title="No visits yet"
                body="Consults booked from your public page or a family's portal land here."
              />
            ) : (
              groupByDay(upcoming, timeZone, now).map((day) => (
                <div key={day.key} className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-teal">
                    {day.label}
                  </p>
                  {day.items.map((entry) => (
                    <div key={entry.id} className="rounded-xl border border-input/60 p-3 text-sm">
                      <p className="font-medium text-teal-ink">
                        {formatSlotTime(entry.startsAt, timeZone)} ·{" "}
                        {formatDuration(durationMinutes(entry.startsAt, entry.endsAt))}
                      </p>
                      <p className="text-muted-foreground">
                        {clientVisitLabel({ title: entry.title, type: entry.type })}
                        {entry.locationLabel ? ` · ${entry.locationLabel}` : ""}
                      </p>
                      {entry.clientName ? (
                        // The name on the visit is the way into the family's record —
                        // a schedule you cannot click through is a dead end (C10).
                        entry.clientId ? (
                          <Link
                            href={`/doula/clients/${entry.clientId}`}
                            className="mt-1 inline-block font-medium text-teal underline underline-offset-4"
                          >
                            {entry.clientName}
                          </Link>
                        ) : (
                          <p className="mt-1 font-medium text-teal-ink">{entry.clientName}</p>
                        )
                      ) : null}
                    </div>
                  ))}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ) : null}

      {view === "settings" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,2.2fr)_minmax(300px,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Weekly schedule</CardTitle>
              <CardDescription>
                Paint the hours you are open. They repeat every week until you change them,
                on your practice&rsquo;s clock — {timeZone} ({zone}). A gap between two
                blocks is a gap families cannot book.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <AvailabilityWeekGrid
                windows={rules}
                zoneLabel={`${timeZone} (${zone})`}
                action={saveAvailabilityAction}
              />
              <p className="text-sm text-muted-foreground">
                {openForFamilies.length > 0
                  ? `Families see ${openForFamilies.length} open ${
                      openForFamilies.length === 1 ? "window" : "windows"
                    } over the next ${BOOKING_HORIZON_DAYS} days.`
                  : `Families see no open windows over the next ${BOOKING_HORIZON_DAYS} days.`}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Time off</CardTitle>
              <CardDescription>
                Block a whole day, or just the hour you are at the dentist. Whatever you
                block stops opening — nobody can book a time you are away.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form action={saveTimeOffAction} className="space-y-2.5">
                <div className="flex flex-wrap items-end gap-2">
                  <label className="text-[12.5px] font-medium text-teal-ink">
                    <span className="block">Date</span>
                    <input
                      type="date"
                      name="timeOffStart"
                      required
                      defaultValue={dayKey(now, timeZone)}
                      className={SELECT_CLASS}
                    />
                  </label>
                  <label className="text-[12.5px] font-medium text-teal-ink">
                    <span className="block">Through</span>
                    <input type="date" name="timeOffEnd" className={SELECT_CLASS} />
                  </label>
                </div>
                {/* Hours are the point of this panel, so they sit on the form rather than
                    behind an "advanced" disclosure — and blank still means the whole day,
                    which is what every block written before today meant. */}
                <div className="flex flex-wrap items-end gap-2">
                  <label className="text-[12.5px] font-medium text-teal-ink">
                    <span className="block">From</span>
                    <input type="time" name="timeOffFrom" step={1800} className={SELECT_CLASS} />
                  </label>
                  <label className="text-[12.5px] font-medium text-teal-ink">
                    <span className="block">To</span>
                    <input type="time" name="timeOffTo" step={1800} className={SELECT_CLASS} />
                  </label>
                  <p className="pb-1.5 text-[11.5px] text-muted-foreground">
                    Leave both blank for the whole day.
                  </p>
                </div>
                <label className="block text-[12.5px] font-medium text-teal-ink">
                  <span className="block">What is it?</span>
                  <input
                    type="text"
                    name="timeOffLabel"
                    placeholder="Time off"
                    className={cn(SELECT_CLASS, "w-full")}
                  />
                </label>
                <Button type="submit" variant="outline">
                  Block this time
                </Button>
              </form>
              {timeOff.length === 0 ? (
                <p className="rounded-lg bg-cloud/70 px-3 py-2.5 text-[12.5px] text-muted-foreground">
                  Nothing blocked. Every day your weekly windows are open, families can book.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {timeOff.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-cloud/70 px-3 py-2"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold text-teal-ink">
                          {entry.title}
                        </span>
                        <span className="block text-[12px] tabular-nums text-muted-foreground">
                          {formatTimeOffSpan(entry.startsAt, entry.endsAt, timeZone)}
                        </span>
                      </span>
                      <form action={removeTimeOffAction}>
                        <input type="hidden" name="eventId" value={entry.id} />
                        <button
                          type="submit"
                          className="rounded-md px-2 py-1 text-[12px] font-semibold text-coral ring-1 ring-coral/25 transition-colors hover:bg-coral/10"
                        >
                          Unblock
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "teal",
  wide = false,
}: {
  label: string;
  value: string;
  tone?: "teal" | "coral";
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg bg-card px-3 py-2 ring-1 ring-teal/12",
        wide ? "min-w-[168px]" : "min-w-[104px]",
      )}
    >
      <dt className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-teal-ink/55">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-0.5 truncate text-[14px] font-semibold",
          tone === "coral" ? "text-coral" : "text-teal-ink",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function ViewTab({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors",
        active
          ? "bg-teal text-cloud"
          : "text-teal-ink/70 ring-1 ring-teal/15 hover:bg-teal/10 hover:text-teal-ink",
      )}
    >
      {label}
    </Link>
  );
}

function ViewToggle({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "rounded-md px-2.5 py-1 text-[12px] font-semibold transition-colors",
        active ? "bg-teal text-cloud" : "text-teal-ink/65 hover:text-teal-ink",
      )}
    >
      {label}
    </Link>
  );
}

/** The contents of one month cell: what is booked, what is closed, what is still open. */
function MonthCellBody({
  day,
  visits,
  off,
  openCount,
  timeZone,
}: {
  day: CalendarDay;
  visits: ScheduleEntry[];
  off: DayTimeOff;
  openCount: number;
  timeZone: string;
}) {
  const shown = visits.slice(0, CHIPS_PER_CELL);
  const hidden = visits.length - shown.length;
  const closed = off.closed;
  return (
    <div className="flex flex-1 flex-col gap-0.5">
      {closed ? (
        <span className="rounded-md bg-teal-ink/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-teal-ink/65">
          Time off
        </span>
      ) : (
        off.partial.map((entry) => (
          <span
            key={entry.id}
            className="truncate rounded-md bg-teal-ink/8 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-teal-ink/60"
          >
            Away {formatSlotTime(entry.startsAt, timeZone)}–{formatSlotTime(entry.endsAt, timeZone)}
          </span>
        ))
      )}
      {shown.map((visit) => (
        <DayChip
          key={visit.id}
          time={formatSlotTime(visit.startsAt, timeZone)}
          label={visit.clientName ?? clientVisitLabel({ title: visit.title, type: visit.type })}
          href={visit.clientId ? `/doula/clients/${visit.clientId}` : undefined}
          tone={day.isPast ? "ink" : "teal"}
        />
      ))}
      {hidden > 0 ? (
        <span className="px-1.5 text-[10.5px] font-semibold text-teal">+{hidden} more</span>
      ) : null}
      {!closed && openCount > 0 ? (
        <span className="mt-auto px-1.5 text-[10.5px] text-teal-ink/45">{openCount} open</span>
      ) : null}
    </div>
  );
}

/** Week view: the same seven days, given room to show every visit and every open hour. */
function WeekColumns({
  days,
  visitsByDay,
  dayTimeOff,
  openSlotsOnDay,
  timeZone,
}: {
  days: CalendarDay[];
  visitsByDay: Map<string, ScheduleEntry[]>;
  dayTimeOff: (day: CalendarDay) => DayTimeOff;
  openSlotsOnDay: Map<string, Slot[]>;
  timeZone: string;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-7">
      {days.map((day) => {
        const visits = visitsByDay.get(day.key) ?? [];
        const off = dayTimeOff(day);
        const closed = off.closed;
        const open = day.isPast || closed ? [] : (openSlotsOnDay.get(day.key) ?? []);
        return (
          <div
            key={day.key}
            className={cn(
              "flex min-h-[224px] flex-col gap-1.5 rounded-xl p-2 ring-1",
              day.isToday ? "bg-card ring-coral/60" : "bg-card ring-teal/12",
            )}
          >
            <div className="flex items-baseline justify-between gap-1 border-b border-teal/10 pb-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-teal">
                {WEEKDAY_ABBREVIATIONS[day.weekday]}
              </span>
              <span
                className={cn(
                  "text-[13px] font-semibold tabular-nums",
                  day.isToday ? "text-coral" : "text-teal-ink",
                )}
              >
                {day.day}
              </span>
            </div>
            {closed ? (
              <span className="rounded-md bg-teal-ink/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-teal-ink/65">
                Time off
              </span>
            ) : (
              off.partial.map((entry) => (
                <span
                  key={entry.id}
                  className="truncate rounded-md bg-teal-ink/8 px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums text-teal-ink/60"
                >
                  Away {formatSlotTime(entry.startsAt, timeZone)}–
                  {formatSlotTime(entry.endsAt, timeZone)}
                </span>
              ))
            )}
            {visits.map((visit) => {
              const place = visitPlace(visit.locationLabel);
              return (
                <div
                  key={visit.id}
                  className={cn(
                    "rounded-lg px-2 py-1.5",
                    day.isPast ? "bg-teal-ink/6" : "bg-teal/10",
                  )}
                >
                  <p className="text-[11.5px] font-semibold tabular-nums text-teal-ink">
                    {formatSlotTime(visit.startsAt, timeZone)} ·{" "}
                    {formatDuration(durationMinutes(visit.startsAt, visit.endsAt))}
                  </p>
                  <p className="truncate text-[11.5px] text-teal-ink/75">
                    {clientVisitLabel({ title: visit.title, type: visit.type })}
                  </p>
                  {place ? (
                    place.kind === "link" ? (
                      <a
                        href={place.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] font-semibold text-teal underline underline-offset-2"
                      >
                        {place.label}
                      </a>
                    ) : (
                      <p className="truncate text-[11px] text-muted-foreground">{place.label}</p>
                    )
                  ) : null}
                  {visit.clientName ? (
                    visit.clientId ? (
                      <Link
                        href={`/doula/clients/${visit.clientId}`}
                        className="mt-0.5 block truncate text-[11.5px] font-semibold text-teal underline underline-offset-2"
                      >
                        {visit.clientName}
                      </Link>
                    ) : (
                      <p className="mt-0.5 truncate text-[11.5px] font-semibold text-teal-ink">
                        {visit.clientName}
                      </p>
                    )
                  ) : null}
                </div>
              );
            })}
            {/* The hours a family could still take, spelled out. A week that only counts
                its open windows is the forever-list again, one column narrower. */}
            {open.length > 0 ? (
              <div className={cn("space-y-1 pt-1", visits.length > 0 && "mt-auto")}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-teal-ink/45">
                  Open
                </p>
                <div className="flex flex-wrap gap-1">
                  {open.slice(0, WEEK_OPEN_CHIPS).map((slot) => (
                    <span
                      key={slot.startsAt.toISOString()}
                      className="rounded-md bg-cloud px-1.5 py-0.5 text-[10.5px] font-medium tabular-nums text-teal-ink/70 ring-1 ring-teal/12"
                    >
                      {formatSlotTime(slot.startsAt, timeZone)}
                    </span>
                  ))}
                  {open.length > WEEK_OPEN_CHIPS ? (
                    <span className="px-1 text-[10.5px] font-semibold text-teal">
                      +{open.length - WEEK_OPEN_CHIPS}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : visits.length === 0 && !closed ? (
              <p className="text-[11.5px] text-teal-ink/35">
                {day.isPast ? "Nothing booked" : "No open windows"}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The rail beside the month. A calendar you keep open all day is not only a grid: it is
 * the next few visits you are actually walking into, and whether you are away this week.
 */
function CalendarRail({
  upcoming,
  timeOff,
  timeZone,
  settingsHref,
  upcomingHref,
}: {
  upcoming: ScheduleEntry[];
  timeOff: ScheduleEntry[];
  timeZone: string;
  settingsHref: string;
  upcomingHref: string;
}) {
  const next = upcoming.slice(0, RAIL_VISIT_COUNT);
  return (
    <aside className="space-y-3">
      <div className="rounded-xl bg-cloud p-3 ring-1 ring-teal/12">
        <div className="flex items-baseline justify-between gap-2">
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-teal">
            Next up
          </h4>
          {upcoming.length > next.length ? (
            <Link href={upcomingHref} className="text-[11px] font-semibold text-teal underline underline-offset-2">
              All {upcoming.length}
            </Link>
          ) : null}
        </div>
        {next.length === 0 ? (
          <p className="mt-2 text-[12px] text-muted-foreground">
            Nothing booked yet. Share your booking link and the first consult lands here.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {next.map((visit) => {
              const place = visitPlace(visit.locationLabel);
              return (
                <li key={visit.id} className="rounded-lg bg-card px-2.5 py-2 ring-1 ring-teal/10">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-teal">
                    {formatDayHeading(visit.startsAt, timeZone)}
                  </p>
                  <p className="mt-0.5 text-[12.5px] font-semibold tabular-nums text-teal-ink">
                    {formatSlotTime(visit.startsAt, timeZone)} ·{" "}
                    {formatDuration(durationMinutes(visit.startsAt, visit.endsAt))}
                  </p>
                  <p className="truncate text-[12px] text-muted-foreground">
                    {clientVisitLabel({ title: visit.title, type: visit.type })}
                  </p>
                  {visit.clientName ? (
                    visit.clientId ? (
                      <Link
                        href={`/doula/clients/${visit.clientId}`}
                        className="mt-0.5 block truncate text-[12px] font-semibold text-teal underline underline-offset-2"
                      >
                        {visit.clientName}
                      </Link>
                    ) : (
                      <p className="mt-0.5 truncate text-[12px] font-semibold text-teal-ink">
                        {visit.clientName}
                      </p>
                    )
                  ) : null}
                  {place?.kind === "link" ? (
                    <a
                      href={place.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block rounded-md bg-teal px-2 py-0.5 text-[11px] font-semibold text-cloud"
                    >
                      {place.label}
                    </a>
                  ) : place ? (
                    <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
                      {place.label}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="rounded-xl bg-cloud p-3 ring-1 ring-teal/12">
        <div className="flex items-baseline justify-between gap-2">
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-teal">Away</h4>
          <Link href={settingsHref} className="text-[11px] font-semibold text-teal underline underline-offset-2">
            {timeOff.length > 0 ? "Edit" : "Add"}
          </Link>
        </div>
        {timeOff.length === 0 ? (
          <p className="mt-2 text-[12px] text-muted-foreground">
            No days blocked. Book time off before a family books it for you.
          </p>
        ) : (
          <ul className="mt-2 space-y-1">
            {timeOff.slice(0, RAIL_VISIT_COUNT).map((entry) => (
              <li key={entry.id} className="rounded-lg bg-card px-2.5 py-1.5 ring-1 ring-teal/10">
                <p className="truncate text-[12.5px] font-semibold text-teal-ink">{entry.title}</p>
                <p className="text-[11.5px] text-muted-foreground">
                  {formatTimeOffSpan(entry.startsAt, entry.endsAt, timeZone)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
