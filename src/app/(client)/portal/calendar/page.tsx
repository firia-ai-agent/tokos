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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/brand/states";
import { SlotPicker } from "@/components/brand/slot-picker";

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
  const now = new Date();
  // Upcoming only — a consult that already happened is history, not a plan.
  const { upcoming } = await listClientConsults({
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

  return (
    <div className="space-y-6">
      <h2 className="font-heading text-2xl text-teal-ink">Your visits with {doula.firstName}</h2>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
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
                {day.items.map((event) => (
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
                    {event.locationLabel ? (
                      <p className="mt-1 text-sm text-muted-foreground">{event.locationLabel}</p>
                    ) : null}
                    <Link
                      href="/portal/messages"
                      className="mt-3 inline-block text-sm font-medium text-teal underline underline-offset-4"
                    >
                      Message {doula.firstName} to change
                    </Link>
                  </div>
                ))}
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
  );
}
