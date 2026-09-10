/**
 * The shape a calendar is drawn in (TOK-54).
 *
 * `/doula/calendar` shipped as a column of availability checkboxes beside a list that
 * ran forever, and `/portal/visits` as a single card under a heading. Neither is a
 * calendar: a doula plans by looking at a month, and a family reads "the 11th" before
 * it reads "Friday, Sep 11". So the pages now draw a grid — and every rule that decides
 * which day a thing lands on lives here, pure, because the interesting bugs in a
 * calendar are all timezone bugs and none of them need a database to reproduce.
 *
 * Everything is computed in the practice's zone. The server runs in UTC, so a 9pm-EDT
 * visit is already "tomorrow" to `Date#getDate()` — the month grid would put it in the
 * wrong cell, and on the 31st in the wrong month.
 */

import {
  AVAILABILITY_STEP_MINUTES,
  DEFAULT_TIMEZONE,
  dayKey,
  formatSlotTime,
  parseClockMinutes,
  zonedParts,
  zonedTimeToUtc,
  type Slot,
} from "@/lib/calendar";

const MINUTE_MS = 60_000;
const DAY_MINUTES = 24 * 60;

/** Monday-first, to match the Mon–Sun order the availability editor already uses. */
export const WEEK_START_WEEKDAY = 1;

export const WEEKDAY_HEADINGS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export type CalendarDay = {
  /** "2026-09-11" in the practice's zone — the join key for everything placed on the grid. */
  key: string;
  year: number;
  month: number;
  day: number;
  weekday: number;
  /** False for the leading/trailing days that only exist to square the grid off. */
  inMonth: boolean;
  isToday: boolean;
  isPast: boolean;
  /** Midnight-to-midnight in the practice's zone, as instants. */
  startsAt: Date;
  endsAt: Date;
};

export type CalendarWeek = { key: string; days: CalendarDay[] };

export type CalendarGrid = {
  /** "2026-09" for a month view, the Monday's day key for a week view. */
  anchor: string;
  /** "September 2026" / "Sep 7 – Sep 13, 2026". */
  label: string;
  days: CalendarDay[];
  weeks: CalendarWeek[];
};

const monthLabelFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
});

const rangeLabelFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
});

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/** "2026-09" for the month an instant falls in, as seen in `timeZone`. */
export function monthKey(at: Date, timeZone: string = DEFAULT_TIMEZONE): string {
  const parts = zonedParts(at, timeZone);
  return `${parts.year}-${pad(parts.month)}`;
}

/**
 * Month navigation is arithmetic on the key, not on a Date: adding 30 days to Jan 31
 * lands in March, and adding a month to a Date in a DST week can slide the hour.
 */
export function shiftMonthKey(key: string, delta: number): string {
  const parsed = parseMonthKey(key);
  if (!parsed) return key;
  const zeroBased = parsed.year * 12 + (parsed.month - 1) + delta;
  return `${Math.floor(zeroBased / 12)}-${pad((zeroBased % 12) + 1)}`;
}

/** "2026-09-14" — the same day next/previous week, in the practice's zone. */
export function shiftDayKey(key: string, deltaDays: number, timeZone = DEFAULT_TIMEZONE): string {
  const parsed = parseDayKey(key);
  if (!parsed) return key;
  const at = zonedTimeToUtc(
    { year: parsed.year, month: parsed.month, day: parsed.day + deltaDays, minutes: 0 },
    timeZone,
  );
  return dayKey(at, timeZone);
}

export function parseMonthKey(raw: unknown): { year: number; month: number } | null {
  if (typeof raw !== "string") return null;
  const match = /^(\d{4})-(\d{2})$/.exec(raw.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12 || year < 1970 || year > 2999) return null;
  return { year, month };
}

export function parseDayKey(raw: unknown): { year: number; month: number; day: number } | null {
  if (typeof raw !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1970 || year > 2999) return null;
  return { year, month, day };
}

function buildDay(
  seed: { year: number; month: number; day: number },
  input: { timeZone: string; todayKey: string; inMonth: boolean },
): CalendarDay {
  const startsAt = zonedTimeToUtc({ ...seed, minutes: 0 }, input.timeZone);
  const parts = zonedParts(startsAt, input.timeZone);
  const endsAt = zonedTimeToUtc(
    { year: parts.year, month: parts.month, day: parts.day + 1, minutes: 0 },
    input.timeZone,
  );
  const key = `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
  return {
    key,
    year: parts.year,
    month: parts.month,
    day: parts.day,
    weekday: parts.weekday,
    inMonth: input.inMonth,
    isToday: key === input.todayKey,
    isPast: key < input.todayKey,
    startsAt,
    endsAt,
  };
}

function chunkIntoWeeks(days: CalendarDay[]): CalendarWeek[] {
  const weeks: CalendarWeek[] = [];
  for (let index = 0; index < days.length; index += 7) {
    const slice = days.slice(index, index + 7);
    weeks.push({ key: slice[0]?.key ?? String(index), days: slice });
  }
  return weeks;
}

/** How many days back from `weekday` the week's Monday is. */
function backToWeekStart(weekday: number): number {
  return (weekday - WEEK_START_WEEKDAY + 7) % 7;
}

/**
 * A whole month, squared off to full Mon–Sun weeks. The leading and trailing days are
 * real days — a visit on Oct 1 shows in the September grid's last row rather than
 * disappearing, which is the entire reason a month view has grey edges.
 */
export function monthGrid(input: {
  month: string;
  timeZone?: string;
  now?: Date;
}): CalendarGrid {
  const timeZone = input.timeZone ?? DEFAULT_TIMEZONE;
  const now = input.now ?? new Date();
  const todayKey = dayKey(now, timeZone);
  const parsed = parseMonthKey(input.month) ?? {
    year: zonedParts(now, timeZone).year,
    month: zonedParts(now, timeZone).month,
  };

  const first = buildDay({ ...parsed, day: 1 }, { timeZone, todayKey, inMonth: true });
  const lead = backToWeekStart(first.weekday);
  const days: CalendarDay[] = [];

  // Walk day-by-day from the grid's first Monday. Six rows always covers a month; the
  // trailing row is dropped when it holds nothing from this month.
  for (let offset = -lead; days.length < 42; offset += 1) {
    const seed = { year: parsed.year, month: parsed.month, day: 1 + offset };
    const probe = zonedTimeToUtc({ ...seed, minutes: 0 }, timeZone);
    const parts = zonedParts(probe, timeZone);
    days.push(
      buildDay(seed, {
        timeZone,
        todayKey,
        inMonth: parts.year === parsed.year && parts.month === parsed.month,
      }),
    );
  }

  const weeks = chunkIntoWeeks(days).filter((week) => week.days.some((day) => day.inMonth));
  return {
    anchor: `${parsed.year}-${pad(parsed.month)}`,
    label: monthLabelFormatter.format(Date.UTC(parsed.year, parsed.month - 1, 1)),
    days: weeks.flatMap((week) => week.days),
    weeks,
  };
}

/** The Mon–Sun week containing `day`. */
export function weekGrid(input: { day: string; timeZone?: string; now?: Date }): CalendarGrid {
  const timeZone = input.timeZone ?? DEFAULT_TIMEZONE;
  const now = input.now ?? new Date();
  const todayKey = dayKey(now, timeZone);
  const parsed = parseDayKey(input.day) ?? parseDayKey(todayKey)!;

  const anchorDay = buildDay(parsed, { timeZone, todayKey, inMonth: true });
  const lead = backToWeekStart(anchorDay.weekday);
  const days: CalendarDay[] = [];
  for (let offset = 0; offset < 7; offset += 1) {
    days.push(
      buildDay(
        { year: parsed.year, month: parsed.month, day: parsed.day - lead + offset },
        { timeZone, todayKey, inMonth: true },
      ),
    );
  }

  const start = days[0];
  const end = days[6];
  const label = `${rangeLabelFormatter.format(
    Date.UTC(start.year, start.month - 1, start.day),
  )} – ${rangeLabelFormatter.format(Date.UTC(end.year, end.month - 1, end.day))}, ${end.year}`;

  return { anchor: start.key, label, days, weeks: [{ key: start.key, days }] };
}

/**
 * Every day key an event touches, in the practice's zone. A one-hour visit yields one
 * key; a week of vacation yields seven, so a day off paints across the whole row. The
 * end is exclusive — midnight-to-midnight is one day, not two.
 */
export function spanDayKeys(
  startsAt: Date,
  endsAt: Date,
  timeZone: string = DEFAULT_TIMEZONE,
): string[] {
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) return [];
  const keys: string[] = [];
  const first = zonedParts(startsAt, timeZone);
  const lastKey = dayKey(new Date(Math.max(startsAt.getTime(), endsAt.getTime() - 1)), timeZone);
  for (let offset = 0; offset < 400; offset += 1) {
    const at = zonedTimeToUtc(
      { year: first.year, month: first.month, day: first.day + offset, minutes: 0 },
      timeZone,
    );
    const key = dayKey(at, timeZone);
    keys.push(key);
    if (key >= lastKey) break;
  }
  return keys;
}

/**
 * Bucket anything with a start (and optionally an end) onto day keys. Used for booked
 * visits, vacation bands and the open windows a family can still take, so all three
 * land on the same cell from the same rule.
 */
export function bucketByDay<T extends { startsAt: Date; endsAt?: Date }>(
  items: readonly T[],
  timeZone: string = DEFAULT_TIMEZONE,
): Map<string, T[]> {
  const byDay = new Map<string, T[]>();
  for (const item of items) {
    const keys = item.endsAt
      ? spanDayKeys(item.startsAt, item.endsAt, timeZone)
      : [dayKey(item.startsAt, timeZone)];
    for (const key of keys) {
      const bucket = byDay.get(key);
      if (bucket) bucket.push(item);
      else byDay.set(key, [item]);
    }
  }
  return byDay;
}

/** Open windows per day, for the "3 open" hint on a family's month cell. */
export function openSlotsByDay(
  slots: readonly Slot[],
  timeZone: string = DEFAULT_TIMEZONE,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const slot of slots) {
    const key = dayKey(slot.startsAt, timeZone);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/* ------------------------------------------------------------------ *
 * Where a visit happens
 * ------------------------------------------------------------------ */

export type VisitPlace =
  | { kind: "link"; url: string; label: string; text: string }
  | { kind: "place"; label: string }
  | null;

const MEETING_HOSTS: { match: RegExp; label: string }[] = [
  { match: /(^|\.)zoom\.us$/i, label: "Join Zoom" },
  { match: /^meet\.google\.com$/i, label: "Join Google Meet" },
  { match: /(^|\.)teams\.microsoft\.com$|^teams\.live\.com$/i, label: "Join Teams" },
  { match: /(^|\.)whereby\.com$/i, label: "Join Whereby" },
  { match: /(^|\.)doxy\.me$/i, label: "Join Doxy.me" },
  { match: /(^|\.)facetime\.apple\.com$/i, label: "Join FaceTime" },
];

/** Bare "meet.google.com/abc-defg-hij" is a link a family should be able to tap. */
const BARE_MEETING = /\b((?:[\w-]+\.)*(?:zoom\.us|meet\.google\.com|whereby\.com|doxy\.me)\/[^\s,;]+)/i;

function meetingLabelFor(url: string): string {
  try {
    const host = new URL(url).hostname;
    const known = MEETING_HOSTS.find((entry) => entry.match.test(host));
    return known ? known.label : "Join video call";
  } catch {
    return "Join video call";
  }
}

/**
 * Read a `locationLabel` for what it is. "Arlington, VA" and "Video or home visit —
 * confirm in messages" are places and stay text; a Zoom URL is the one thing on the
 * card someone needs to *press* five minutes before a visit, so it becomes a link.
 */
export function visitPlace(locationLabel: string | null | undefined): VisitPlace {
  const text = (locationLabel ?? "").trim();
  if (!text) return null;

  const explicit = /\bhttps?:\/\/[^\s,;]+/i.exec(text);
  if (explicit) {
    const url = explicit[0].replace(/[).,;]+$/, "");
    return { kind: "link", url, label: meetingLabelFor(url), text };
  }

  const bare = BARE_MEETING.exec(text);
  if (bare) {
    const url = `https://${bare[1].replace(/[).,;]+$/, "")}`;
    return { kind: "link", url, label: meetingLabelFor(url), text };
  }

  return { kind: "place", label: text };
}

/* ------------------------------------------------------------------ *
 * Time off
 * ------------------------------------------------------------------ */

/** How long a single block of time off may run, so a typo cannot close the year. */
export const MAX_TIME_OFF_DAYS = 90;

/**
 * Turn the two date inputs on the Settings panel into the instant range a day off
 * covers: local midnight on the first day through local midnight after the last. An
 * inclusive end is what the form says ("Sep 14 to Sep 18" includes the 18th) and an
 * exclusive instant is what the overlap maths needs.
 */
export function parseTimeOffRange(
  startRaw: unknown,
  endRaw: unknown,
  timeZone: string = DEFAULT_TIMEZONE,
): { startsAt: Date; endsAt: Date } | null {
  const start = parseDayKey(startRaw);
  if (!start) return null;
  // One-day time off is the common case, so a blank end means "the same day".
  const end = parseDayKey(endRaw) ?? start;

  const startsAt = zonedTimeToUtc({ ...start, minutes: 0 }, timeZone);
  const endsAt = zonedTimeToUtc({ ...end, day: end.day + 1, minutes: 0 }, timeZone);
  if (endsAt <= startsAt) return null;
  if (endsAt.getTime() - startsAt.getTime() > MAX_TIME_OFF_DAYS * DAY_MINUTES * MINUTE_MS) {
    return null;
  }
  return { startsAt, endsAt };
}

/** "Sep 14" / "Sep 14 – Sep 18" for a saved block, read back in the practice's zone. */
export function formatTimeOffRange(
  startsAt: Date,
  endsAt: Date,
  timeZone: string = DEFAULT_TIMEZONE,
): string {
  const keys = spanDayKeys(startsAt, endsAt, timeZone);
  const first = parseDayKey(keys[0]);
  const last = parseDayKey(keys[keys.length - 1]);
  if (!first || !last) return "";
  const from = rangeLabelFormatter.format(Date.UTC(first.year, first.month - 1, first.day));
  if (keys.length === 1) return from;
  const to = rangeLabelFormatter.format(Date.UTC(last.year, last.month - 1, last.day));
  return `${from} – ${to}`;
}

/* ------------------------------------------------------------------ *
 * The schedule grid (TOK-78) — paint geometry lives in schedule-paint.ts
 * (client-safe). Re-exported here so existing server/test imports keep working.
 * ------------------------------------------------------------------ */

export {
  SCHEDULE_STEP_MINUTES,
  SCHEDULE_DEFAULT_BLOCK_MINUTES,
  SCHEDULE_DEFAULT_START_MINUTES,
  SCHEDULE_DEFAULT_END_MINUTES,
  scheduleBounds,
  scheduleHourTicks,
  blockPlacement,
  minutesAtRatio,
  paintedRange,
  nextFreeWindow,
  type ScheduleBounds,
} from "@/lib/schedule-paint";

/* ------------------------------------------------------------------ *
 * Partial-day time off (TOK-78)
 * ------------------------------------------------------------------ */

/**
 * Time off with a clock on it. A dentist appointment is an hour, not a day, and burning
 * the whole Tuesday to protect 1–2pm is how a calendar starts lying to the book page.
 *
 * Blank times still mean the whole day, which is what the date-only form always did — so
 * every block written before this ticket reads back unchanged. With times, the block runs
 * from the first date's start time straight through to the last date's end time, the way
 * "out from Friday lunchtime until Monday morning" is one absence and not three.
 */
export function parseTimeOffSpan(
  input: {
    start: unknown;
    end?: unknown;
    fromTime?: unknown;
    toTime?: unknown;
  },
  timeZone: string = DEFAULT_TIMEZONE,
): { startsAt: Date; endsAt: Date; wholeDay: boolean } | null {
  const start = parseDayKey(input.start);
  if (!start) return null;
  const end = parseDayKey(input.end) ?? start;

  const fromMinutes = parseClockMinutes(input.fromTime);
  const toMinutes = parseClockMinutes(input.toTime);
  const wholeDay = fromMinutes === null && toMinutes === null;

  // A form that offered a clock and got nothing on one side means "from the top of the
  // day" / "until the end of it", never midnight-to-midnight on the other side.
  const openAt = wholeDay ? 0 : (fromMinutes ?? 0);
  const closeAt = wholeDay ? 0 : (toMinutes ?? DAY_MINUTES);

  const startsAt = zonedTimeToUtc({ ...start, minutes: openAt }, timeZone);
  const endsAt = wholeDay
    ? zonedTimeToUtc({ ...end, day: end.day + 1, minutes: 0 }, timeZone)
    : zonedTimeToUtc({ ...end, minutes: closeAt }, timeZone);

  if (endsAt <= startsAt) return null;
  if (endsAt.getTime() - startsAt.getTime() > MAX_TIME_OFF_DAYS * DAY_MINUTES * MINUTE_MS) {
    return null;
  }
  return { startsAt, endsAt, wholeDay };
}

/** True when a block runs midnight to midnight in the practice's zone. */
export function isWholeDayOff(
  startsAt: Date,
  endsAt: Date,
  timeZone: string = DEFAULT_TIMEZONE,
): boolean {
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) return false;
  if (endsAt <= startsAt) return false;
  return zonedParts(startsAt, timeZone).minutes === 0 && zonedParts(endsAt, timeZone).minutes === 0;
}

/**
 * Whether a block closes a whole calendar day. The month cell's "Time off" flag reads
 * this rather than "touches the day at all": a 1–2pm block that greyed out the entire
 * Tuesday would be the same lie the ticket is removing, one surface over.
 */
export function coversWholeDay(
  block: { startsAt: Date; endsAt: Date },
  day: { startsAt: Date; endsAt: Date },
): boolean {
  return block.startsAt <= day.startsAt && block.endsAt >= day.endsAt;
}

/**
 * "Sep 14" / "Sep 14 – Sep 18" / "Sep 14 · 1:00 PM – 2:00 PM". The clock only appears
 * when there is one, so a whole day off still reads the way it always did.
 */
export function formatTimeOffSpan(
  startsAt: Date,
  endsAt: Date,
  timeZone: string = DEFAULT_TIMEZONE,
): string {
  const dates = formatTimeOffRange(startsAt, endsAt, timeZone);
  if (isWholeDayOff(startsAt, endsAt, timeZone)) return `${dates} · All day`;
  return `${dates} · ${formatSlotTime(startsAt, timeZone)} – ${formatSlotTime(endsAt, timeZone)}`;
}
