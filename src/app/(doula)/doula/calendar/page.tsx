import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { availability } from "@/db/schema";
import {
  BOOKING_HORIZON_DAYS,
  clientVisitLabel,
  durationMinutes,
  formatDuration,
  formatSlotTime,
  groupByDay,
  halfHourOptions,
  listOpenSlots,
  listSchedule,
  organizationTimezone,
  timezoneLabel,
} from "@/lib/calendar";
import { requireStaff } from "@/lib/tenancy";
import { saveAvailabilityAction } from "@/app/actions/doula";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/brand/states";

const DAYS = [
  { n: 1, label: "Monday" },
  { n: 2, label: "Tuesday" },
  { n: 3, label: "Wednesday" },
  { n: 4, label: "Thursday" },
  { n: 5, label: "Friday" },
  { n: 6, label: "Saturday" },
  { n: 0, label: "Sunday" },
];

/** 12:00 AM–11:30 PM to open a window, 12:30 AM–midnight to close it. */
const START_OPTIONS = halfHourOptions(0, 23 * 60 + 30);
const END_OPTIONS = halfHourOptions(30, 24 * 60);

const SELECT_CLASS =
  "h-8 rounded-lg border border-input bg-transparent px-2 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * A half-hour select, not a raw hour integer (TOK-33 C8). The old form asked a doula to
 * type `10` and `16` into number boxes, which could neither express 9:30 nor say which
 * clock it meant.
 */
function TimeSelect({
  name,
  defaultValue,
  options,
  label,
}: {
  name: string;
  defaultValue: number;
  options: { value: number; label: string }[];
  label: string;
}) {
  return (
    <select name={name} defaultValue={defaultValue} aria-label={label} className={SELECT_CLASS}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export default async function CalendarPage() {
  const staff = await requireStaff();
  const db = getDb();
  const now = new Date();
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
  const { upcoming } = await listSchedule({
    organizationId: staff.organizationId,
    userId: staff.userId,
    now,
  });
  const timeZone = await organizationTimezone(staff.organizationId);
  // What a family would actually see if they opened the booking page right now — the
  // windows minus everything already booked (C11).
  const openForFamilies = await listOpenSlots({
    organizationId: staff.organizationId,
    userId: staff.userId,
    from: now,
  });
  const zone = timezoneLabel(now, timeZone);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Weekly availability</CardTitle>
          <CardDescription>
            Times are your practice&rsquo;s clock — {timeZone} ({zone}).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form action={saveAvailabilityAction} className="space-y-3">
            {DAYS.map((day) => {
              const rule = rules.find((item) => item.weekday === day.n);
              return (
                <div key={day.n} className="flex flex-wrap items-center gap-2 text-sm">
                  <label className="flex w-32 items-center gap-2">
                    <input
                      type="checkbox"
                      name={`day-${day.n}`}
                      defaultChecked={Boolean(rule)}
                    />
                    {day.label}
                  </label>
                  <TimeSelect
                    name={`start-${day.n}`}
                    defaultValue={rule?.startMinutes ?? 10 * 60}
                    options={START_OPTIONS}
                    label={`${day.label} opens at`}
                  />
                  <span>to</span>
                  <TimeSelect
                    name={`end-${day.n}`}
                    defaultValue={rule?.endMinutes ?? 16 * 60}
                    options={END_OPTIONS}
                    label={`${day.label} closes at`}
                  />
                </div>
              );
            })}
            <Button type="submit">Save windows</Button>
          </form>
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
    </div>
  );
}
