import { and, eq } from "drizzle-orm";
import { format } from "date-fns";
import { getDb } from "@/db";
import { assignments, calendarEvents } from "@/db/schema";
import { requireClient } from "@/lib/tenancy";
import { bookClientConsultAction } from "@/app/actions/client";
import { formatSlot, listOpenSlots } from "@/lib/calendar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/brand/states";

export default async function PortalCalendarPage() {
  const session = await requireClient();
  const db = getDb();
  const events = await db
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.organizationId, session.organizationId),
        eq(calendarEvents.clientId, session.clientId),
      ),
    );
  const [assignment] = await db
    .select()
    .from(assignments)
    .where(and(eq(assignments.clientId, session.clientId), eq(assignments.status, "active")))
    .limit(1);

  const slots = assignment
    ? await listOpenSlots({
        organizationId: session.organizationId,
        userId: assignment.userId,
      })
    : [];

  return (
    <div className="space-y-6">
      <h2 className="font-heading text-2xl text-teal-ink">Consults</h2>
      {events.length === 0 ? (
        <EmptyState title="Nothing booked" body="Pick a fit window below." />
      ) : (
        <div className="space-y-2">
          {events.map((event) => (
            <p key={event.id} className="rounded-xl border bg-card p-3 text-sm">
              {format(event.startsAt, "EEE MMM d, h:mm a")} · {event.title}
            </p>
          ))}
        </div>
      )}
      {assignment && slots.length > 0 ? (
        <form action={bookClientConsultAction} className="space-y-3">
          <input type="hidden" name="assigneeUserId" value={assignment.userId} />
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Open times</legend>
            {slots.slice(0, 10).map((slot) => (
              <label key={slot.startsAt.toISOString()} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="slot"
                  value={`${slot.startsAt.toISOString()}|${slot.endsAt.toISOString()}`}
                  required
                />
                {formatSlot(slot.startsAt)}
              </label>
            ))}
          </fieldset>
          <Button type="submit">Book consult</Button>
        </form>
      ) : null}
    </div>
  );
}
