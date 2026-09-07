import { and, eq } from "drizzle-orm";
import { format } from "date-fns";
import { getDb } from "@/db";
import { availability, calendarEvents } from "@/db/schema";
import { requireStaff } from "@/lib/tenancy";
import { saveAvailabilityAction } from "@/app/actions/doula";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export default async function CalendarPage() {
  const staff = await requireStaff();
  const db = getDb();
  const rules = await db
    .select()
    .from(availability)
    .where(
      and(
        eq(availability.organizationId, staff.organizationId),
        eq(availability.userId, staff.userId),
      ),
    );
  const events = await db
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.organizationId, staff.organizationId),
        eq(calendarEvents.assigneeUserId, staff.userId),
      ),
    );

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Weekly availability</CardTitle>
        </CardHeader>
        <CardContent>
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
                  <Input
                    className="w-20"
                    name={`start-${day.n}`}
                    type="number"
                    min={0}
                    max={23}
                    defaultValue={rule ? Math.floor(rule.startMinutes / 60) : 10}
                  />
                  <span>to</span>
                  <Input
                    className="w-20"
                    name={`end-${day.n}`}
                    type="number"
                    min={1}
                    max={24}
                    defaultValue={rule ? Math.floor(rule.endMinutes / 60) : 16}
                  />
                </div>
              );
            })}
            <Button type="submit">Save windows</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Upcoming on Tokos calendar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {events.length === 0 ? (
            <EmptyState
              title="No visits yet"
              body="Fit consults from your public Book button land here."
            />
          ) : (
            events.map((event) => (
              <p key={event.id} className="text-sm">
                {format(event.startsAt, "EEE MMM d, h:mm a")} · {event.title} · {event.status}
              </p>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
