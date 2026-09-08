import { requireClient } from "@/lib/tenancy";
import { resolveAssignedDoulaName } from "@/lib/assigned-doula";
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
  // Upcoming only — a consult that already happened is history, not a plan.
  const { upcoming } = await listClientConsults({
    organizationId: session.organizationId,
    clientId: session.clientId,
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
          <EmptyState
            title="Nothing booked"
            body={
              doula.userId
                ? `Pick a fit window on ${doula.firstName}'s calendar below.`
                : "A fit window will open here once you are matched with a doula."
            }
          />
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
      {doula.userId && slots.length > 0 ? (
        <section className="space-y-3">
          <h3 className="text-sm font-medium">Book another with {doula.firstName}</h3>
          <form action={bookClientConsultAction} className="space-y-3">
            <input type="hidden" name="assigneeUserId" value={doula.userId} />
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
