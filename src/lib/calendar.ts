import { and, eq, gt, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { availability, calendarEvents, clients, organizations } from "@/db/schema";

/**
 * Tokos calendar system of record (TOK-26). No Acuity, no third-party scheduler:
 * availability rules live in `availability`, booked time lives in `calendar_events`,
 * and every bookable slot is derived from those two tables.
 *
 * Availability is stored as wall-clock minutes for a weekday in a named zone
 * (America/New_York for NOVA). Slots must therefore be expanded *in that zone* —
 * the server runs in UTC, so a naive `startOfDay` would slide a 10:00 window to
 * 06:00 EDT and shift again at every DST boundary.
 */

export const DEFAULT_TIMEZONE = "America/New_York";
export const SLOT_MINUTES = 60;
export const BOOKING_HORIZON_DAYS = 14;

const MINUTE_MS = 60_000;
const DAY_MINUTES = 24 * 60;

export type AvailabilityRule = {
  weekday: number;
  startMinutes: number;
  endMinutes: number;
  timezone?: string | null;
};

export type Slot = { startsAt: Date; endsAt: Date };

export type BusyBlock = { startsAt: Date; endsAt: Date };

export type SlotRejection = "past" | "outside_availability" | "already_booked";

export type SlotCheck = { ok: true } | { ok: false; reason: SlotRejection };

export const SLOT_REJECTION_MESSAGES: Record<SlotRejection, string> = {
  past: "That time has already passed. Pick another window.",
  outside_availability: "That time is not an open window on this calendar.",
  already_booked: "That window was just taken. Pick another one.",
};

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string) {
  let cached = formatterCache.get(timeZone);
  if (!cached) {
    cached = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      hourCycle: "h23",
    });
    formatterCache.set(timeZone, cached);
  }
  return cached;
}

export type ZonedParts = {
  year: number;
  month: number;
  day: number;
  weekday: number;
  minutes: number;
};

/** Wall-clock calendar fields for an instant, as seen in `timeZone`. */
export function zonedParts(at: Date, timeZone: string): ZonedParts {
  const parts = partsFormatter(timeZone).formatToParts(at);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  // Some ICU builds render midnight as hour 24 under h23.
  const hour = Number(read("hour")) % 24;
  return {
    year: Number(read("year")),
    month: Number(read("month")),
    day: Number(read("day")),
    weekday: WEEKDAY_INDEX[read("weekday")] ?? 0,
    minutes: hour * 60 + Number(read("minute")),
  };
}

function offsetMinutes(at: Date, timeZone: string) {
  const parts = zonedParts(at, timeZone);
  const wallAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day) + parts.minutes * MINUTE_MS;
  const instant = Math.floor(at.getTime() / MINUTE_MS) * MINUTE_MS;
  return (wallAsUtc - instant) / MINUTE_MS;
}

/**
 * Resolve a wall-clock time in `timeZone` to the instant it names. `day` and
 * `minutes` may overflow (day 32, minute 1500) so callers can walk a calendar.
 * Two passes settle the offset across DST transitions.
 */
export function zonedTimeToUtc(
  input: { year: number; month: number; day: number; minutes: number },
  timeZone: string,
): Date {
  const wallAsUtc = Date.UTC(input.year, input.month - 1, input.day) + input.minutes * MINUTE_MS;
  let instant = wallAsUtc - offsetMinutes(new Date(wallAsUtc), timeZone) * MINUTE_MS;
  instant = wallAsUtc - offsetMinutes(new Date(instant), timeZone) * MINUTE_MS;
  return new Date(instant);
}

function isUsableRule(rule: AvailabilityRule) {
  return (
    Number.isInteger(rule.weekday) &&
    rule.weekday >= 0 &&
    rule.weekday <= 6 &&
    rule.startMinutes >= 0 &&
    rule.endMinutes <= DAY_MINUTES &&
    rule.startMinutes < rule.endMinutes
  );
}

/**
 * Every slot the rules open between `from` and `from + days`, honouring each
 * rule's own zone. Slots strictly after `from`, sorted, de-duplicated when
 * overlapping rules would emit the same start.
 */
export function expandAvailabilitySlots(input: {
  rules: AvailabilityRule[];
  from: Date;
  days?: number;
  slotMinutes?: number;
  timeZone?: string;
}): Slot[] {
  const days = input.days ?? BOOKING_HORIZON_DAYS;
  const slotMinutes = input.slotMinutes ?? SLOT_MINUTES;
  const fallbackZone = input.timeZone ?? DEFAULT_TIMEZONE;
  const byStart = new Map<number, Slot>();

  for (const rule of input.rules) {
    if (!isUsableRule(rule)) continue;
    const timeZone = rule.timezone || fallbackZone;
    const base = zonedParts(input.from, timeZone);

    for (let dayOffset = 0; dayOffset < days; dayOffset += 1) {
      const midnight = zonedTimeToUtc(
        { year: base.year, month: base.month, day: base.day + dayOffset, minutes: 0 },
        timeZone,
      );
      const day = zonedParts(midnight, timeZone);
      if (day.weekday !== rule.weekday) continue;

      for (
        let minute = rule.startMinutes;
        minute + slotMinutes <= rule.endMinutes;
        minute += slotMinutes
      ) {
        const startsAt = zonedTimeToUtc(
          { year: day.year, month: day.month, day: day.day, minutes: minute },
          timeZone,
        );
        if (startsAt <= input.from) continue;
        byStart.set(startsAt.getTime(), {
          startsAt,
          endsAt: new Date(startsAt.getTime() + slotMinutes * MINUTE_MS),
        });
      }
    }
  }

  return [...byStart.values()].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

function overlaps(a: { startsAt: Date; endsAt: Date }, b: { startsAt: Date; endsAt: Date }) {
  return a.startsAt < b.endsAt && a.endsAt > b.startsAt;
}

export function openSlots(input: {
  rules: AvailabilityRule[];
  busy: BusyBlock[];
  from: Date;
  days?: number;
  slotMinutes?: number;
  timeZone?: string;
}): Slot[] {
  return expandAvailabilitySlots(input).filter(
    (slot) => !input.busy.some((block) => overlaps(slot, block)),
  );
}

/**
 * The booking gate. A slot is open only if it is in the future, is exactly one
 * of the slots the rules generate, and collides with nothing already scheduled.
 * Both booking paths run this server-side — the radio list a browser posted back
 * is a hint, never the authority.
 */
export function isSlotOpen(input: {
  rules: AvailabilityRule[];
  busy: BusyBlock[];
  startsAt: Date;
  endsAt: Date;
  now?: Date;
  days?: number;
  slotMinutes?: number;
  timeZone?: string;
}): SlotCheck {
  const now = input.now ?? new Date();
  if (Number.isNaN(input.startsAt.getTime()) || Number.isNaN(input.endsAt.getTime())) {
    return { ok: false, reason: "outside_availability" };
  }
  if (input.startsAt <= now) return { ok: false, reason: "past" };

  const offered = expandAvailabilitySlots({
    rules: input.rules,
    from: now,
    days: input.days,
    slotMinutes: input.slotMinutes,
    timeZone: input.timeZone,
  });
  const match = offered.some(
    (slot) =>
      slot.startsAt.getTime() === input.startsAt.getTime() &&
      slot.endsAt.getTime() === input.endsAt.getTime(),
  );
  if (!match) return { ok: false, reason: "outside_availability" };

  const taken = input.busy.some((block) =>
    overlaps({ startsAt: input.startsAt, endsAt: input.endsAt }, block),
  );
  if (taken) return { ok: false, reason: "already_booked" };

  return { ok: true };
}

async function loadCalendar(input: {
  organizationId: string;
  userId: string;
  from: Date;
  days: number;
}) {
  const db = getDb();
  const to = new Date(input.from.getTime() + input.days * DAY_MINUTES * MINUTE_MS);

  const [org] = await db
    .select({ timezone: organizations.timezone })
    .from(organizations)
    .where(eq(organizations.id, input.organizationId))
    .limit(1);

  const rules = await db
    .select()
    .from(availability)
    .where(
      and(
        eq(availability.organizationId, input.organizationId),
        eq(availability.userId, input.userId),
      ),
    );

  // Anything overlapping the horizon counts as busy, including an event that
  // started before `from` and is still running.
  const busy = await db
    .select({ startsAt: calendarEvents.startsAt, endsAt: calendarEvents.endsAt })
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.organizationId, input.organizationId),
        eq(calendarEvents.assigneeUserId, input.userId),
        eq(calendarEvents.status, "scheduled"),
        lt(calendarEvents.startsAt, to),
        gt(calendarEvents.endsAt, input.from),
      ),
    );

  return { rules, busy, timeZone: org?.timezone || DEFAULT_TIMEZONE };
}

export async function listOpenSlots(input: {
  organizationId: string;
  userId: string;
  from?: Date;
  days?: number;
}): Promise<Slot[]> {
  const from = input.from ?? new Date();
  const days = input.days ?? BOOKING_HORIZON_DAYS;
  const { rules, busy, timeZone } = await loadCalendar({ ...input, from, days });
  return openSlots({ rules, busy, from, days, timeZone });
}

/** Server-side re-check of a slot a client asked for. */
export async function checkSlot(input: {
  organizationId: string;
  userId: string;
  startsAt: Date;
  endsAt: Date;
  now?: Date;
}): Promise<SlotCheck> {
  const now = input.now ?? new Date();
  const { rules, busy, timeZone } = await loadCalendar({
    organizationId: input.organizationId,
    userId: input.userId,
    from: now,
    days: BOOKING_HORIZON_DAYS,
  });
  return isSlotOpen({
    rules,
    busy,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    now,
    timeZone,
  });
}

export class SlotUnavailableError extends Error {
  readonly reason: SlotRejection;
  constructor(reason: SlotRejection) {
    super(SLOT_REJECTION_MESSAGES[reason]);
    this.name = "SlotUnavailableError";
    this.reason = reason;
  }
}

export async function assertSlotOpen(input: {
  organizationId: string;
  userId: string;
  startsAt: Date;
  endsAt: Date;
  now?: Date;
}) {
  const check = await checkSlot(input);
  if (!check.ok) throw new SlotUnavailableError(check.reason);
}

export type ScheduleEntry = {
  id: string;
  title: string;
  type: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
  locationLabel: string | null;
  clientId: string | null;
  clientName: string | null;
};

/**
 * "My schedule" for a doula: what is booked on their own calendar, split at now.
 * Org-scoped and assignee-scoped, so Cedar never reads NOVA's day.
 */
export async function listSchedule(input: {
  organizationId: string;
  userId: string;
  now?: Date;
}): Promise<{ upcoming: ScheduleEntry[]; past: ScheduleEntry[] }> {
  const db = getDb();
  const now = input.now ?? new Date();
  const rows = await db
    .select({
      event: calendarEvents,
      clientName: clients.displayName,
      preferredName: clients.preferredName,
    })
    .from(calendarEvents)
    .leftJoin(clients, eq(clients.id, calendarEvents.clientId))
    .where(
      and(
        eq(calendarEvents.organizationId, input.organizationId),
        eq(calendarEvents.assigneeUserId, input.userId),
      ),
    );

  const entries: ScheduleEntry[] = rows.map((row) => ({
    id: row.event.id,
    title: row.event.title,
    type: row.event.type,
    status: row.event.status,
    startsAt: row.event.startsAt,
    endsAt: row.event.endsAt,
    locationLabel: row.event.locationLabel,
    clientId: row.event.clientId,
    clientName: row.preferredName || row.clientName || null,
  }));

  const upcoming = entries
    .filter((entry) => entry.endsAt > now && entry.status === "scheduled")
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const past = entries
    .filter((entry) => entry.endsAt <= now || entry.status !== "scheduled")
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());

  return { upcoming, past };
}

/** Client-facing consults, split at now. */
export async function listClientConsults(input: {
  organizationId: string;
  clientId: string;
  now?: Date;
}) {
  const db = getDb();
  const now = input.now ?? new Date();
  const rows = await db
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.organizationId, input.organizationId),
        eq(calendarEvents.clientId, input.clientId),
      ),
    );

  const upcoming = rows
    .filter((row) => row.endsAt > now && row.status === "scheduled")
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const past = rows
    .filter((row) => row.endsAt <= now || row.status !== "scheduled")
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());

  return { upcoming, past };
}

const slotFormatterCache = new Map<string, Intl.DateTimeFormat>();

function slotFormatter(timeZone: string) {
  let cached = slotFormatterCache.get(timeZone);
  if (!cached) {
    cached = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    slotFormatterCache.set(timeZone, cached);
  }
  return cached;
}

/** "Thu Sep 10, 10:00 AM" in the practice's zone, whatever zone the server runs in. */
export function formatSlot(startsAt: Date, timeZone: string = DEFAULT_TIMEZONE) {
  return slotFormatter(timeZone).format(startsAt).replace(/,\s(\d)/, ", $1");
}

/** "EDT" / "EST" — so a client never guesses which clock a time is on. */
export function timezoneLabel(at: Date, timeZone: string = DEFAULT_TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" }).formatToParts(
    at,
  );
  return parts.find((part) => part.type === "timeZoneName")?.value ?? timeZone;
}

export async function organizationTimezone(organizationId: string) {
  const db = getDb();
  const [org] = await db
    .select({ timezone: organizations.timezone })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  return org?.timezone || DEFAULT_TIMEZONE;
}
