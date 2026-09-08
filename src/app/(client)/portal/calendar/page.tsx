import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { assignments } from "@/db/schema";
import { requireClient } from "@/lib/tenancy";
import { bookClientConsultAction } from "@/app/actions/client";
import {
  SLOT_REJECTION_MESSAGES,
  formatSlot,
  listClientConsults,
  listOpenSlots,
  organizationTimezone,
  type SlotRejection,
} from "@/lib/calendar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/brand/states";

function rejectionMessage(error?: string) {
  if (!error) return null;
  return (
    SLOT_REJECTION_MESSAGES[error as SlotRejection] ??
    "We could not book that window. Pick another one."
  );
}

export default async function PortalCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireClient();
  const query = await searchParams;
  const db = getDb();
  // Upcoming only — a consult that already happened is history, not a plan.
  const { upcoming } = await listClientConsults({
    organizationId: session.organizationId,
    clientId: session.clientId,
  });
  const timeZone = await organizationTimezone(session.organizationId);
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
  const error = rejectionMessage(query.error);

  return (
    <div className="space-y-6">
      <h2 className="font-heading text-2xl text-teal-ink">Consults</h2>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <section className="space-y-3">
        <h3 className="text-sm font-medium">Upcoming consults</h3>
        {upcoming.length === 0 ? (
          <EmptyState title="Nothing booked" body="Pick a fit window below." />
        ) : (
          <div className="space-y-2">
            {upcoming.map((event) => (
              <p key={event.id} className="rounded-xl border bg-card p-3 text-sm">
                {formatSlot(event.startsAt, timeZone)} · {event.title}
              </p>
            ))}
          </div>
        )}
      </section>
      {assignment && slots.length > 0 ? (
        <section className="space-y-3">
          <h3 className="text-sm font-medium">Book another</h3>
          <form action={bookClientConsultAction} className="space-y-3">
            <input type="hidden" name="assigneeUserId" value={assignment.userId} />
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Open times</legend>
              {slots.slice(0, 10).map((slot) => (
                <label
                  key={slot.startsAt.toISOString()}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    type="radio"
                    name="slot"
                    value={`${slot.startsAt.toISOString()}|${slot.endsAt.toISOString()}`}
                    required
                  />
                  {formatSlot(slot.startsAt, timeZone)}
                </label>
              ))}
            </fieldset>
            <Button type="submit">Book consult</Button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
