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
/**
 * Vacation lives in the calendar the practice already keeps (TOK-54). A day off is a
 * `calendar_events` row of this type covering the whole day in the practice's zone, so
 * blocking a week is the same write as booking a visit — no second table, no second
 * source of truth, and every slot reader subtracts it for free.
 */
export const TIME_OFF_TYPE = "time_off";
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

/**
 * Drop every slot a day off swallows. Kept separate from the `busy` filter because the
 * two mean different things to a family: a booked hour is *taken*, a vacation day is
 * *closed*, and only the second one should ever be editable from a Settings panel.
 */
export function subtractTimeOff<T extends { startsAt: Date; endsAt: Date }>(
  slots: readonly T[],
  timeOff: readonly BusyBlock[],
): T[] {
  if (timeOff.length === 0) return [...slots];
  return slots.filter((slot) => !timeOff.some((block) => overlaps(slot, block)));
}

export function openSlots(input: {
  rules: AvailabilityRule[];
  busy: BusyBlock[];
  timeOff?: BusyBlock[];
  from: Date;
  days?: number;
  slotMinutes?: number;
  timeZone?: string;
}): Slot[] {
  const free = expandAvailabilitySlots(input).filter(
    (slot) => !input.busy.some((block) => overlaps(slot, block)),
  );
  return subtractTimeOff(free, input.timeOff ?? []);
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
  timeOff?: BusyBlock[];
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

  // A vacation day reads as "not an open window", not as "already booked": nobody took
  // the hour, the practice closed it.
  const closed = (input.timeOff ?? []).some((block) =>
    overlaps({ startsAt: input.startsAt, endsAt: input.endsAt }, block),
  );
  if (closed) return { ok: false, reason: "outside_availability" };

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
  const blocks = await db
    .select({
      type: calendarEvents.type,
      startsAt: calendarEvents.startsAt,
      endsAt: calendarEvents.endsAt,
    })
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

  return {
    rules,
    busy: blocks.filter((block) => block.type !== TIME_OFF_TYPE),
    timeOff: blocks.filter((block) => block.type === TIME_OFF_TYPE),
    timeZone: org?.timezone || DEFAULT_TIMEZONE,
  };
}

export async function listOpenSlots(input: {
  organizationId: string;
  userId: string;
  from?: Date;
  days?: number;
}): Promise<Slot[]> {
  const from = input.from ?? new Date();
  const days = input.days ?? BOOKING_HORIZON_DAYS;
  const { rules, busy, timeOff, timeZone } = await loadCalendar({ ...input, from, days });
  return openSlots({ rules, busy, timeOff, from, days, timeZone });
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
  const { rules, busy, timeOff, timeZone } = await loadCalendar({
    organizationId: input.organizationId,
    userId: input.userId,
    from: now,
    days: BOOKING_HORIZON_DAYS,
  });
  return isSlotOpen({
    rules,
    busy,
    timeOff,
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
}): Promise<{ upcoming: ScheduleEntry[]; past: ScheduleEntry[]; timeOff: ScheduleEntry[] }> {
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

  // Time off shares the table but is not a visit: it belongs on the grid as a closed
  // band and in Settings as something to cancel, never in "Upcoming visits".
  const visits = entries.filter((entry) => entry.type !== TIME_OFF_TYPE);
  const upcoming = visits
    .filter((entry) => entry.endsAt > now && entry.status === "scheduled")
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const past = visits
    .filter((entry) => entry.endsAt <= now || entry.status !== "scheduled")
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
  const timeOff = entries
    .filter((entry) => entry.type === TIME_OFF_TYPE && entry.status === "scheduled")
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  return { upcoming, past, timeOff };
}

/**
 * A visit that never got resolved (TOK-58).
 *
 * `calendar_events.status` starts at `scheduled` and is meant to move: canceled when it is
 * called off, `no_show` when nobody came. Nothing moves it when a visit simply happens and
 * the practice forgets the calendar, which is the case a Needs Attention queue exists for —
 * so a past visit still sitting in an unresolved status reads as missed, exactly as a
 * marked `no_show` does. A `no_show` counts whatever the clock says; every other status
 * has to be in the past first, because a booking next Tuesday is not a problem today.
 *
 * Canceled visits and time off are never missed: one was called off on purpose and the
 * other is not a visit at all.
 */
export const MISSED_VISIT_STATUS = "no_show";
export const UNRESOLVED_VISIT_STATUSES = ["scheduled", "unconfirmed"] as const;

export function isMissedVisit(
  event: { type?: string | null; status?: string | null; endsAt: Date | string },
  now: Date = new Date(),
): boolean {
  if (event.type === TIME_OFF_TYPE) return false;
  const status = (event.status ?? "").trim();
  if (status === MISSED_VISIT_STATUS) return true;
  if (!(UNRESOLVED_VISIT_STATUSES as readonly string[]).includes(status)) return false;
  const endsAt = event.endsAt instanceof Date ? event.endsAt : new Date(event.endsAt);
  return !Number.isNaN(endsAt.getTime()) && endsAt < now;
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

/* ------------------------------------------------------------------ *
 * Presentation helpers (TOK-33)
 *
 * A calendar is a shape, not a list: families pick a time by scanning days,
 * so the UI groups instants by their day *in the practice's zone* and never
 * by the server's UTC date. Everything below is pure — the pages stay thin
 * and the grouping/labelling rules are testable without a database.
 * ------------------------------------------------------------------ */

/** How many times a booking form shows before the rest go behind "More times". */
export const VISIBLE_SLOT_COUNT = 5;

/** Availability is edited in half-hour steps, never in raw hour integers. */
export const AVAILABILITY_STEP_MINUTES = 30;

export type DayGroup<T> = { key: string; label: string; items: T[] };

const dayFormatterCache = new Map<string, Intl.DateTimeFormat>();
const timeFormatterCache = new Map<string, Intl.DateTimeFormat>();

function cachedFormatter(
  cache: Map<string, Intl.DateTimeFormat>,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
) {
  let cached = cache.get(timeZone);
  if (!cached) {
    cached = new Intl.DateTimeFormat("en-US", { timeZone, ...options });
    cache.set(timeZone, cached);
  }
  return cached;
}

/** "2026-09-10" as seen in `timeZone` — the identity of a day, safe to sort on. */
export function dayKey(at: Date, timeZone: string = DEFAULT_TIMEZONE): string {
  const parts = zonedParts(at, timeZone);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

/** "10:00 AM" in the practice's zone. */
export function formatSlotTime(at: Date, timeZone: string = DEFAULT_TIMEZONE): string {
  return cachedFormatter(timeFormatterCache, timeZone, {
    hour: "numeric",
    minute: "2-digit",
  }).format(at);
}

/**
 * "Today" / "Tomorrow" / "Thursday, Sep 10". The two relative labels are worth the
 * branch: they are how someone reads a schedule out loud, and they are computed from
 * the day keys so a 9pm-EDT "tomorrow" never reads as "today" because UTC rolled over.
 */
export function formatDayHeading(
  at: Date,
  timeZone: string = DEFAULT_TIMEZONE,
  now: Date = new Date(),
): string {
  const key = dayKey(at, timeZone);
  if (key === dayKey(now, timeZone)) return "Today";
  if (key === dayKey(new Date(now.getTime() + DAY_MINUTES * MINUTE_MS), timeZone)) {
    return "Tomorrow";
  }
  return cachedFormatter(dayFormatterCache, timeZone, {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(at);
}

/**
 * Bucket anything with a `startsAt` into day cards, preserving the order the caller
 * sorted in. Used by the client picker, the client's booked visits, the doula's week
 * and the public book page, so all four read the same way.
 */
export function groupByDay<T extends { startsAt: Date }>(
  items: readonly T[],
  timeZone: string = DEFAULT_TIMEZONE,
  now: Date = new Date(),
): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  const byKey = new Map<string, DayGroup<T>>();
  for (const item of items) {
    const key = dayKey(item.startsAt, timeZone);
    let group = byKey.get(key);
    if (!group) {
      group = { key, label: formatDayHeading(item.startsAt, timeZone, now), items: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}

/**
 * The first `limit` times stay on screen; the rest hide behind "More times". Split on
 * the flat list rather than on whole days so a doula who opened one very long Monday
 * does not push every other day out of sight.
 */
export function splitSlots<T>(
  slots: readonly T[],
  limit: number = VISIBLE_SLOT_COUNT,
): { visible: T[]; more: T[] } {
  const safeLimit = Math.max(0, limit);
  return { visible: slots.slice(0, safeLimit), more: slots.slice(safeLimit) };
}

export function durationMinutes(startsAt: Date, endsAt: Date): number {
  return Math.max(0, Math.round((endsAt.getTime() - startsAt.getTime()) / MINUTE_MS));
}

/** "45 min" / "1 hr" / "1 hr 30 min" — a length a family can plan around. */
export function formatDuration(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  if (whole < 60) return `${whole} min`;
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  const hourLabel = `${hours} hr`;
  return rest === 0 ? hourLabel : `${hourLabel} ${rest} min`;
}

/**
 * Internal scheduling words a family never asked for. "Fit consult" is how a practice
 * triages; "Introductory consult" is what someone is actually attending (TOK-33 C14).
 */
const VISIT_LABEL_OVERRIDES: Record<string, string> = {
  "fit consult": "Introductory consult",
  "fit call": "Introductory call",
  "fit visit": "Introductory visit",
  "lead consult": "Introductory consult",
};

export function clientVisitLabel(input: { title?: string | null; type?: string | null }): string {
  const title = (input.title ?? "").trim();
  const override = VISIT_LABEL_OVERRIDES[title.toLowerCase()];
  if (override) return override;
  if (title) return title;
  return input.type === "consult" ? "Introductory consult" : "Visit";
}

/** "12:00 AM" … "11:30 PM", and "Midnight" for the end of the day. */
export function formatMinutesOfDay(minutes: number): string {
  if (minutes >= DAY_MINUTES) return "Midnight";
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour < 12 ? "AM" : "PM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${String(minute).padStart(2, "0")} ${suffix}`;
}

export type MinuteOption = { value: number; label: string };

/**
 * Half-hour choices for the availability form. `from`/`to` are inclusive, so the start
 * select stops at 11:30 PM and the end select can reach midnight.
 */
export function halfHourOptions(from = 0, to = DAY_MINUTES): MinuteOption[] {
  const options: MinuteOption[] = [];
  for (let minutes = from; minutes <= to; minutes += AVAILABILITY_STEP_MINUTES) {
    options.push({ value: minutes, label: formatMinutesOfDay(minutes) });
  }
  return options;
}

/**
 * Parse one day's window off the availability form. Returns null for anything that is
 * not a clean half-hour range inside a single day — the form posts strings, so the
 * server decides what a window is, not the browser.
 */
export function parseAvailabilityWindow(
  startRaw: unknown,
  endRaw: unknown,
): { startMinutes: number; endMinutes: number } | null {
  // Not `Number(raw)`: a missing field posts "" and `Number("")` is 0, which would turn
  // a dropped select into a window that opens at midnight.
  const minutesOf = (raw: unknown): number | null => {
    if (typeof raw !== "string" && typeof raw !== "number") return null;
    const text = String(raw).trim();
    if (!/^\d+$/.test(text)) return null;
    const value = Number(text);
    if (value > DAY_MINUTES || value % AVAILABILITY_STEP_MINUTES !== 0) return null;
    return value;
  };
  const startMinutes = minutesOf(startRaw);
  const endMinutes = minutesOf(endRaw);
  if (startMinutes === null || endMinutes === null) return null;
  if (startMinutes >= endMinutes) return null;
  return { startMinutes, endMinutes };
}

/* ------------------------------------------------------------------ *
 * Weekly windows (TOK-78)
 *
 * A weekday is a *list* of open ranges, not one From→To. Real weeks have holes in
 * them — a prenatal visit at noon, a clinic that runs only afternoons — and the old
 * single-row-per-day editor could express none of it, so a doula either published
 * hours she could not keep or lost the afternoon to protect the lunch break.
 *
 * The table already allowed several rows per weekday; nothing here migrates. A seeded
 * single window loads as a one-window day and saves back as one row.
 *
 * Everything below is pure so the schedule grid, the server action and the tests all
 * agree on what a window is without a database or a browser.
 * ------------------------------------------------------------------ */

export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const WEEKDAY_SHORT_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Monday-first — the order the schedule grid draws its columns in. */
export const WEEK_COLUMN_WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as const;

export type WeekWindow = { weekday: number; startMinutes: number; endMinutes: number };

export type MinuteRange = { startMinutes: number; endMinutes: number };

/** Why a posted week of windows was refused, in terms a doula can act on. */
export type WindowsErrorCode = "unreadable" | "order" | "overlap";

export type WindowsResult =
  | { ok: true; windows: WeekWindow[] }
  | { ok: false; code: WindowsErrorCode; weekday?: number };

export function availabilityErrorMessage(code: WindowsErrorCode, weekday?: number): string {
  const day =
    typeof weekday === "number" && WEEKDAY_NAMES[weekday] ? WEEKDAY_NAMES[weekday] : null;
  switch (code) {
    case "overlap":
      return day
        ? `Two ${day} windows cover the same hour. Windows on one day cannot overlap — drag one of them clear.`
        : "Two windows on the same day cover the same hour. Windows on one day cannot overlap.";
    case "order":
      return day
        ? `A ${day} window ends before it starts. Give it an end time later than its start.`
        : "A window ends before it starts. Give it an end time later than its start.";
    default:
      return "Those windows did not read as times. Nothing was saved — try again.";
  }
}

/** Weekday, then start. Stable order for storage, display and comparison. */
export function sortWeekWindows(windows: readonly WeekWindow[]): WeekWindow[] {
  return [...windows].sort(
    (a, b) => a.weekday - b.weekday || a.startMinutes - b.startMinutes,
  );
}

/** One day's ranges, sorted and de-overlapped. Touching ranges join: 10–12 + 12–4 is 10–4. */
export function mergeDayWindows(ranges: readonly MinuteRange[]): MinuteRange[] {
  const sorted = [...ranges]
    .filter((range) => range.startMinutes < range.endMinutes)
    .sort((a, b) => a.startMinutes - b.startMinutes);
  const merged: MinuteRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.startMinutes <= last.endMinutes) {
      last.endMinutes = Math.max(last.endMinutes, range.endMinutes);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

/**
 * The stored rules, grouped into the shape the editor draws: every weekday present,
 * each holding its sorted windows. An empty list is a closed day — there is no separate
 * "enabled" flag to drift out of step with the rows.
 */
export function windowsByWeekday(
  rules: readonly { weekday: number; startMinutes: number; endMinutes: number }[],
): Map<number, MinuteRange[]> {
  const byDay = new Map<number, MinuteRange[]>();
  for (const weekday of WEEK_COLUMN_WEEKDAYS) byDay.set(weekday, []);
  for (const rule of rules) {
    const bucket = byDay.get(rule.weekday);
    if (!bucket) continue;
    if (!(rule.startMinutes < rule.endMinutes)) continue;
    bucket.push({ startMinutes: rule.startMinutes, endMinutes: rule.endMinutes });
  }
  for (const [weekday, bucket] of byDay) {
    byDay.set(
      weekday,
      bucket.sort((a, b) => a.startMinutes - b.startMinutes),
    );
  }
  return byDay;
}

/**
 * The gate every save runs through. Overlap is checked per day rather than merged away,
 * because a POST that did not come from the grid deserves an answer, not a silent
 * rewrite of what it asked for.
 */
export function validateWeekWindows(windows: readonly WeekWindow[]): WindowsResult {
  for (const window of windows) {
    if (!Number.isInteger(window.weekday) || window.weekday < 0 || window.weekday > 6) {
      return { ok: false, code: "unreadable" };
    }
    if (
      !Number.isInteger(window.startMinutes) ||
      !Number.isInteger(window.endMinutes) ||
      window.startMinutes < 0 ||
      window.endMinutes > DAY_MINUTES
    ) {
      return { ok: false, code: "unreadable" };
    }
    if (window.startMinutes >= window.endMinutes) {
      return { ok: false, code: "order", weekday: window.weekday };
    }
  }

  const sorted = sortWeekWindows(windows);
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (previous.weekday === current.weekday && current.startMinutes < previous.endMinutes) {
      return { ok: false, code: "overlap", weekday: current.weekday };
    }
  }

  return { ok: true, windows: sorted };
}

/**
 * Read the week the grid posted. One JSON field carries the whole week, so a day that
 * lost all its windows is expressed by its absence rather than by a checkbox the server
 * has to reconcile against a stale row.
 */
export function parseWeekWindows(raw: unknown): WindowsResult {
  let value: unknown = raw;
  if (typeof raw === "string") {
    const text = raw.trim();
    if (!text) return { ok: true, windows: [] };
    try {
      value = JSON.parse(text);
    } catch {
      return { ok: false, code: "unreadable" };
    }
  }
  if (!Array.isArray(value)) return { ok: false, code: "unreadable" };

  const windows: WeekWindow[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") return { ok: false, code: "unreadable" };
    const record = entry as Record<string, unknown>;
    const weekday = Number(record.weekday);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      return { ok: false, code: "unreadable" };
    }
    // Same half-hour rules the old per-day form was held to (TOK-33 C8) — the grid snaps
    // to the same steps, so anything else came from somewhere else.
    const range = parseAvailabilityWindow(record.startMinutes, record.endMinutes);
    if (!range) {
      const start = Number(record.startMinutes);
      const end = Number(record.endMinutes);
      if (Number.isInteger(start) && Number.isInteger(end) && start >= end) {
        return { ok: false, code: "order", weekday };
      }
      return { ok: false, code: "unreadable" };
    }
    windows.push({ weekday, ...range });
  }

  return validateWeekWindows(windows);
}

/** "10:00 AM – 12:00 PM" — one window, spelled out. */
export function formatWindowRange(startMinutes: number, endMinutes: number): string {
  return `${formatMinutesOfDay(startMinutes)} – ${formatMinutesOfDay(endMinutes)}`;
}

/** "10a", "12:30p" — dense enough to sit inside a grid block. */
export function formatMinutesCompact(minutes: number): string {
  if (minutes >= DAY_MINUTES) return "12a";
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour < 12 ? "a" : "p";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return minute === 0
    ? `${display}${suffix}`
    : `${display}:${String(minute).padStart(2, "0")}${suffix}`;
}

/** "10a–12p · 2–4p" for a column heading, or the closed-day word. */
export function summarizeDayWindows(ranges: readonly MinuteRange[]): string {
  if (ranges.length === 0) return "Closed";
  return ranges
    .map((range) => `${formatMinutesCompact(range.startMinutes)}–${formatMinutesCompact(range.endMinutes)}`)
    .join(" · ");
}

/** Total open minutes in a day, for the "5 hrs" a column header carries. */
export function dayWindowMinutes(ranges: readonly MinuteRange[]): number {
  return ranges.reduce((total, range) => total + (range.endMinutes - range.startMinutes), 0);
}

/**
 * "13:00" off an `<input type="time">` as minutes past midnight. Blank is null and so is
 * junk: a time-off form that dropped its clock means "the whole day", never "midnight".
 */
export function parseClockMinutes(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 24 || minute > 59) return null;
  const minutes = hour * 60 + minute;
  return minutes > DAY_MINUTES ? null : minutes;
}
