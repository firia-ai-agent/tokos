/**
 * Pure availability-window helpers (TOK-78).
 * Client-safe — no `@/db` imports.
 */

const DAY_MINUTES = 24 * 60;
export const AVAILABILITY_STEP_MINUTES = 30;

export function formatDuration(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  if (whole < 60) return `${whole} min`;
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  const hourLabel = `${hours} hr`;
  return rest === 0 ? hourLabel : `${hourLabel} ${rest} min`;
}

export function formatMinutesOfDay(minutes: number): string {
  if (minutes >= DAY_MINUTES) return "Midnight";
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour < 12 ? "AM" : "PM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${String(minute).padStart(2, "0")} ${suffix}`;
}

export type MinuteOption = { value: number; label: string };

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
