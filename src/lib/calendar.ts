import { addDays, addMinutes, format, startOfDay } from "date-fns";
import { and, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { availability, calendarEvents } from "@/db/schema";

export function expandAvailabilitySlots(input: {
  rules: Array<{ weekday: number; startMinutes: number; endMinutes: number }>;
  from: Date;
  days?: number;
  slotMinutes?: number;
}) {
  const days = input.days ?? 14;
  const slotMinutes = input.slotMinutes ?? 60;
  const slots: Array<{ startsAt: Date; endsAt: Date }> = [];

  for (let dayOffset = 0; dayOffset < days; dayOffset += 1) {
    const day = addDays(startOfDay(input.from), dayOffset);
    const weekday = day.getDay();
    const rules = input.rules.filter((rule) => rule.weekday === weekday);
    for (const rule of rules) {
      for (let minute = rule.startMinutes; minute + slotMinutes <= rule.endMinutes; minute += slotMinutes) {
        const startsAt = addMinutes(day, minute);
        if (startsAt <= input.from) continue;
        slots.push({
          startsAt,
          endsAt: addMinutes(startsAt, slotMinutes),
        });
      }
    }
  }
  return slots;
}

export async function listOpenSlots(input: {
  organizationId: string;
  userId: string;
  from?: Date;
}) {
  const db = getDb();
  const from = input.from ?? new Date();
  const to = addDays(from, 14);

  const rules = await db
    .select()
    .from(availability)
    .where(
      and(
        eq(availability.organizationId, input.organizationId),
        eq(availability.userId, input.userId),
      ),
    );

  const existing = await db
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.organizationId, input.organizationId),
        eq(calendarEvents.assigneeUserId, input.userId),
        gte(calendarEvents.startsAt, from),
        lte(calendarEvents.startsAt, to),
        eq(calendarEvents.status, "scheduled"),
      ),
    );

  const taken = new Set(existing.map((event) => event.startsAt.toISOString()));
  return expandAvailabilitySlots({ rules, from }).filter(
    (slot) => !taken.has(slot.startsAt.toISOString()),
  );
}

export function formatSlot(startsAt: Date) {
  return format(startsAt, "EEE MMM d, h:mm a");
}
