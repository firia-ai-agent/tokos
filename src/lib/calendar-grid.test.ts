import { describe, expect, it } from "vitest";
import { openSlots, subtractTimeOff, zonedParts, type Slot } from "@/lib/calendar";
import {
  MAX_TIME_OFF_DAYS,
  blockPlacement,
  bucketByDay,
  coversWholeDay,
  formatTimeOffRange,
  formatTimeOffSpan,
  isWholeDayOff,
  minutesAtRatio,
  nextFreeWindow,
  paintedRange,
  parseTimeOffSpan,
  scheduleBounds,
  scheduleHourTicks,
  monthGrid,
  monthKey,
  openSlotsByDay,
  parseDayKey,
  parseMonthKey,
  parseTimeOffRange,
  shiftDayKey,
  shiftMonthKey,
  spanDayKeys,
  visitPlace,
  weekGrid,
} from "@/lib/calendar-grid";

/**
 * TOK-54. The grid is the part of a calendar that is easy to get wrong and impossible to
 * eyeball: a visit at 9pm EDT is already tomorrow in UTC, a month boundary and a DST
 * boundary can land in the same week, and "block Sep 14 through Sep 18" has to mean five
 * whole days rather than four and a bit. All of it is pure, so all of it is provable here.
 */

const NY = "America/New_York";

describe("month grid", () => {
  const grid = monthGrid({ month: "2026-09", timeZone: NY, now: new Date("2026-09-10T15:00:00Z") });

  it("starts every row on a Monday and ends it on a Sunday", () => {
    for (const week of grid.weeks) {
      expect(week.days).toHaveLength(7);
      expect(week.days[0].weekday).toBe(1);
      expect(week.days[6].weekday).toBe(0);
    }
  });

  it("covers the whole month and nothing more than the rows need", () => {
    const inMonth = grid.days.filter((day) => day.inMonth);
    expect(inMonth).toHaveLength(30);
    expect(inMonth[0].key).toBe("2026-09-01");
    expect(inMonth[29].key).toBe("2026-09-30");
    expect(grid.days.length % 7).toBe(0);
  });

  it("keeps the neighbouring days as real, dimmable days", () => {
    // Sep 1 2026 is a Tuesday, so the first row opens on Aug 31.
    expect(grid.days[0].key).toBe("2026-08-31");
    expect(grid.days[0].inMonth).toBe(false);
    expect(grid.days.at(-1)?.inMonth).toBe(false);
  });

  it("marks today from the practice's clock, not the server's", () => {
    const today = grid.days.filter((day) => day.isToday);
    expect(today).toHaveLength(1);
    expect(today[0].key).toBe("2026-09-10");
    expect(grid.days.find((day) => day.key === "2026-09-09")?.isPast).toBe(true);
    expect(grid.days.find((day) => day.key === "2026-09-11")?.isPast).toBe(false);
  });

  it("labels the month and spans each day midnight to midnight in the zone", () => {
    expect(grid.label).toBe("September 2026");
    const first = grid.days.find((day) => day.key === "2026-09-01")!;
    expect(first.startsAt.toISOString()).toBe("2026-09-01T04:00:00.000Z");
    expect(first.endsAt.toISOString()).toBe("2026-09-02T04:00:00.000Z");
  });

  it("survives the DST boundary — November still has 30 days of 7-day rows", () => {
    const november = monthGrid({
      month: "2026-11",
      timeZone: NY,
      now: new Date("2026-11-15T12:00:00Z"),
    });
    expect(november.days.filter((day) => day.inMonth)).toHaveLength(30);
    const afterFallBack = november.days.find((day) => day.key === "2026-11-02")!;
    expect(afterFallBack.startsAt.toISOString()).toBe("2026-11-02T05:00:00.000Z");
  });

  it("falls back to the current month when the query string is junk", () => {
    const fallback = monthGrid({
      month: "not-a-month",
      timeZone: NY,
      now: new Date("2026-09-10T15:00:00Z"),
    });
    expect(fallback.anchor).toBe("2026-09");
  });
});

describe("week grid", () => {
  it("returns the Mon–Sun week containing the anchor day", () => {
    const week = weekGrid({ day: "2026-09-10", timeZone: NY, now: new Date("2026-09-10T15:00:00Z") });
    expect(week.days.map((day) => day.key)).toEqual([
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
      "2026-09-13",
    ]);
    expect(week.anchor).toBe("2026-09-07");
    expect(week.label).toBe("Sep 7 – Sep 13, 2026");
  });

  it("treats a Sunday as the end of its week, not the start of the next", () => {
    const week = weekGrid({ day: "2026-09-13", timeZone: NY, now: new Date("2026-09-10T15:00:00Z") });
    expect(week.days[0].key).toBe("2026-09-07");
    expect(week.days[6].key).toBe("2026-09-13");
  });
});

describe("navigation keys", () => {
  it("steps months without sliding through a 31st", () => {
    expect(shiftMonthKey("2026-01", 1)).toBe("2026-02");
    expect(shiftMonthKey("2026-12", 1)).toBe("2027-01");
    expect(shiftMonthKey("2026-01", -1)).toBe("2025-12");
    expect(shiftMonthKey("2026-03", -14)).toBe("2025-01");
  });

  it("steps weeks across a DST change and keeps the calendar date", () => {
    expect(shiftDayKey("2026-09-07", 7, NY)).toBe("2026-09-14");
    expect(shiftDayKey("2026-11-02", -7, NY)).toBe("2026-10-26");
  });

  it("hands junk back unchanged rather than navigating somewhere random", () => {
    expect(shiftMonthKey("2026-13", 1)).toBe("2026-13");
    expect(shiftDayKey("nope", 7, NY)).toBe("nope");
    expect(parseMonthKey("2026-00")).toBeNull();
    expect(parseDayKey("2026-9-1")).toBeNull();
    expect(parseDayKey(42)).toBeNull();
  });

  it("names the month an instant falls in, in the practice's zone", () => {
    // 00:30 UTC on Oct 1 is still 8:30pm on Sep 30 in New York.
    expect(monthKey(new Date("2026-10-01T00:30:00Z"), NY)).toBe("2026-09");
  });
});

describe("placing events on days", () => {
  it("puts a late-evening visit on the day the family lived it", () => {
    expect(spanDayKeys(new Date("2026-09-11T01:00:00Z"), new Date("2026-09-11T02:00:00Z"), NY)).toEqual([
      "2026-09-10",
    ]);
  });

  it("paints a block of time off across every day it covers", () => {
    expect(
      spanDayKeys(new Date("2026-09-14T04:00:00Z"), new Date("2026-09-17T04:00:00Z"), NY),
    ).toEqual(["2026-09-14", "2026-09-15", "2026-09-16"]);
  });

  it("buckets visits and vacations onto the cells that draw them", () => {
    const visit = {
      id: "v1",
      startsAt: new Date("2026-09-11T15:00:00Z"),
      endsAt: new Date("2026-09-11T15:45:00Z"),
    };
    const vacation = {
      id: "t1",
      startsAt: new Date("2026-09-14T04:00:00Z"),
      endsAt: new Date("2026-09-16T04:00:00Z"),
    };
    const byDay = bucketByDay([visit, vacation], NY);
    expect(byDay.get("2026-09-11")?.map((item) => item.id)).toEqual(["v1"]);
    expect(byDay.get("2026-09-14")?.map((item) => item.id)).toEqual(["t1"]);
    expect(byDay.get("2026-09-15")?.map((item) => item.id)).toEqual(["t1"]);
    expect(byDay.has("2026-09-16")).toBe(false);
  });

  it("counts the open windows a cell can advertise", () => {
    const slots: Slot[] = [
      { startsAt: new Date("2026-09-11T14:00:00Z"), endsAt: new Date("2026-09-11T15:00:00Z") },
      { startsAt: new Date("2026-09-11T15:00:00Z"), endsAt: new Date("2026-09-11T16:00:00Z") },
      { startsAt: new Date("2026-09-14T14:00:00Z"), endsAt: new Date("2026-09-14T15:00:00Z") },
    ];
    expect(openSlotsByDay(slots, NY)).toEqual(
      new Map([
        ["2026-09-11", 2],
        ["2026-09-14", 1],
      ]),
    );
  });
});

describe("visitPlace — a link to press vs a place to go", () => {
  it("keeps a plain place as text", () => {
    expect(visitPlace("Arlington, VA")).toEqual({ kind: "place", label: "Arlington, VA" });
    expect(visitPlace("Video or home visit — confirm in messages")).toEqual({
      kind: "place",
      label: "Video or home visit — confirm in messages",
    });
  });

  it("treats nothing as nothing", () => {
    expect(visitPlace(null)).toBeNull();
    expect(visitPlace("   ")).toBeNull();
  });

  it("names the meeting a URL opens", () => {
    expect(visitPlace("https://us06web.zoom.us/j/123456")).toMatchObject({
      kind: "link",
      url: "https://us06web.zoom.us/j/123456",
      label: "Join Zoom",
    });
    expect(visitPlace("Video visit — https://meet.google.com/abc-defg-hij")).toMatchObject({
      kind: "link",
      label: "Join Google Meet",
    });
    expect(visitPlace("https://example.com/room/9")).toMatchObject({
      kind: "link",
      label: "Join video call",
    });
  });

  it("still links a meeting address someone pasted without the scheme", () => {
    expect(visitPlace("meet.google.com/abc-defg-hij")).toMatchObject({
      kind: "link",
      url: "https://meet.google.com/abc-defg-hij",
      label: "Join Google Meet",
    });
  });

  it("does not turn a sentence with a full stop into a link", () => {
    expect(visitPlace("Home visit. Park in the driveway.")).toEqual({
      kind: "place",
      label: "Home visit. Park in the driveway.",
    });
  });

  it("drops trailing punctuation the sentence owns, not the URL", () => {
    expect(visitPlace("Join at https://us06web.zoom.us/j/123456.")).toMatchObject({
      url: "https://us06web.zoom.us/j/123456",
    });
  });
});

describe("time off", () => {
  it("covers whole days in the practice's zone, end inclusive", () => {
    const range = parseTimeOffRange("2026-09-14", "2026-09-18", NY)!;
    expect(range.startsAt.toISOString()).toBe("2026-09-14T04:00:00.000Z");
    expect(range.endsAt.toISOString()).toBe("2026-09-19T04:00:00.000Z");
  });

  it("reads a blank end as one day off", () => {
    const range = parseTimeOffRange("2026-09-14", "", NY)!;
    expect(range.endsAt.getTime() - range.startsAt.getTime()).toBe(24 * 60 * 60_000);
  });

  it("refuses a backwards range, junk, or a typo that would close the year", () => {
    expect(parseTimeOffRange("2026-09-18", "2026-09-14", NY)).toBeNull();
    expect(parseTimeOffRange("", "2026-09-14", NY)).toBeNull();
    expect(parseTimeOffRange("2026-09-14", "2029-09-14", NY)).toBeNull();
  });

  it("allows a block right up to the cap", () => {
    const range = parseTimeOffRange("2026-01-01", "2026-03-01", NY)!;
    expect(range.endsAt.getTime() - range.startsAt.getTime()).toBeLessThanOrEqual(
      MAX_TIME_OFF_DAYS * 24 * 60 * 60_000,
    );
  });

  it("reads a saved block back the way the form said it", () => {
    const range = parseTimeOffRange("2026-09-14", "2026-09-18", NY)!;
    expect(formatTimeOffRange(range.startsAt, range.endsAt, NY)).toBe("Sep 14 – Sep 18");
    const single = parseTimeOffRange("2026-09-14", "", NY)!;
    expect(formatTimeOffRange(single.startsAt, single.endsAt, NY)).toBe("Sep 14");
  });
});

describe("subtractTimeOff — a vacation stops offering windows", () => {
  const slots: Slot[] = [
    { startsAt: new Date("2026-09-11T14:00:00Z"), endsAt: new Date("2026-09-11T15:00:00Z") },
    { startsAt: new Date("2026-09-14T14:00:00Z"), endsAt: new Date("2026-09-14T15:00:00Z") },
    { startsAt: new Date("2026-09-16T14:00:00Z"), endsAt: new Date("2026-09-16T15:00:00Z") },
    { startsAt: new Date("2026-09-21T14:00:00Z"), endsAt: new Date("2026-09-21T15:00:00Z") },
  ];

  it("removes every window inside the blocked days and keeps the rest", () => {
    const off = parseTimeOffRange("2026-09-14", "2026-09-18", NY)!;
    expect(subtractTimeOff(slots, [off]).map((slot) => slot.startsAt.toISOString())).toEqual([
      "2026-09-11T14:00:00.000Z",
      "2026-09-21T14:00:00.000Z",
    ]);
  });

  it("leaves the list alone when nothing is blocked", () => {
    expect(subtractTimeOff(slots, [])).toHaveLength(4);
  });

  it("does not eat the window that starts the moment time off ends", () => {
    const off = parseTimeOffRange("2026-09-13", "2026-09-13", NY)!;
    // Sep 14 00:00 EDT is the boundary; the Sep 14 window survives it.
    expect(subtractTimeOff(slots, [off])).toHaveLength(4);
  });
});

/**
 * TOK-78. Two claims worth a test each: an hour blocked is an hour blocked and not a day,
 * and the geometry that puts a block on the grid is the same geometry that decides where
 * the pointer just painted one. Both are the kind of arithmetic that looks right and is
 * off by a half-hour.
 */
describe("partial-day time off (TOK-78)", () => {
  const morningAndAfternoon = [
    { weekday: 1, startMinutes: 600, endMinutes: 720, timezone: NY },
    { weekday: 1, startMinutes: 840, endMinutes: 960, timezone: NY },
  ];

  it("blocks only the span it names", () => {
    const span = parseTimeOffSpan(
      { start: "2026-09-14", fromTime: "13:00", toTime: "14:00" },
      NY,
    )!;
    expect(span.wholeDay).toBe(false);
    expect(span.startsAt.toISOString()).toBe("2026-09-14T17:00:00.000Z");
    expect(span.endsAt.toISOString()).toBe("2026-09-14T18:00:00.000Z");
    expect(isWholeDayOff(span.startsAt, span.endsAt, NY)).toBe(false);
  });

  it("leaves the windows either side of it bookable", () => {
    // Mon 2026-09-14: 10–12 and 2–4, with 3–4 taken by a dentist appointment.
    const off = parseTimeOffSpan({ start: "2026-09-14", fromTime: "15:00", toTime: "16:00" }, NY)!;
    const open = openSlots({
      rules: morningAndAfternoon,
      busy: [],
      timeOff: [off],
      from: new Date("2026-09-14T00:00:00Z"),
      days: 2,
      timeZone: NY,
    });
    const hours = open.map((slot) => zonedParts(slot.startsAt, NY).minutes);
    expect(hours).toEqual([600, 660, 840]);
    // The morning survived and so did 2–3; only the blocked hour went.
    expect(hours).not.toContain(900);
  });

  it("still closes the whole day when no times are given", () => {
    const span = parseTimeOffSpan({ start: "2026-09-14" }, NY)!;
    expect(span.wholeDay).toBe(true);
    expect(isWholeDayOff(span.startsAt, span.endsAt, NY)).toBe(true);
    const open = openSlots({
      rules: morningAndAfternoon,
      busy: [],
      timeOff: [span],
      from: new Date("2026-09-14T00:00:00Z"),
      days: 2,
      timeZone: NY,
    });
    expect(open).toHaveLength(0);
  });

  it("reads a one-sided clock as the top or the end of the day", () => {
    const morning = parseTimeOffSpan({ start: "2026-09-14", toTime: "12:00" }, NY)!;
    expect(zonedParts(morning.startsAt, NY).minutes).toBe(0);
    expect(zonedParts(morning.endsAt, NY).minutes).toBe(720);

    const afternoon = parseTimeOffSpan({ start: "2026-09-14", fromTime: "12:00" }, NY)!;
    expect(zonedParts(afternoon.startsAt, NY).minutes).toBe(720);
    // Midnight the next morning — the day is closed from noon on.
    expect(afternoon.endsAt.toISOString()).toBe("2026-09-15T04:00:00.000Z");
  });

  it("runs a dated range straight through, the way an absence actually runs", () => {
    const span = parseTimeOffSpan(
      { start: "2026-09-11", end: "2026-09-14", fromTime: "12:00", toTime: "10:00" },
      NY,
    )!;
    expect(zonedParts(span.startsAt, NY).day).toBe(11);
    expect(zonedParts(span.startsAt, NY).minutes).toBe(720);
    expect(zonedParts(span.endsAt, NY).day).toBe(14);
    expect(zonedParts(span.endsAt, NY).minutes).toBe(600);
  });

  it("refuses a span that ends before it starts, or one that could close the year", () => {
    expect(parseTimeOffSpan({ start: "2026-09-14", fromTime: "14:00", toTime: "13:00" }, NY)).toBeNull();
    expect(parseTimeOffSpan({ start: "", fromTime: "13:00" }, NY)).toBeNull();
    expect(parseTimeOffSpan({ start: "2026-09-14", end: "2029-09-14" }, NY)).toBeNull();
  });

  it("does not grey out a day a block only clips", () => {
    const day = { startsAt: new Date("2026-09-14T04:00:00Z"), endsAt: new Date("2026-09-15T04:00:00Z") };
    const hour = parseTimeOffSpan({ start: "2026-09-14", fromTime: "13:00", toTime: "14:00" }, NY)!;
    const wholeDay = parseTimeOffSpan({ start: "2026-09-14" }, NY)!;
    const week = parseTimeOffSpan({ start: "2026-09-11", end: "2026-09-18" }, NY)!;

    expect(coversWholeDay(hour, day)).toBe(false);
    expect(coversWholeDay(wholeDay, day)).toBe(true);
    expect(coversWholeDay(week, day)).toBe(true);
  });

  it("reads a saved block back with its clock on it", () => {
    const hour = parseTimeOffSpan({ start: "2026-09-14", fromTime: "13:00", toTime: "14:00" }, NY)!;
    expect(formatTimeOffSpan(hour.startsAt, hour.endsAt, NY)).toBe("Sep 14 · 1:00 PM – 2:00 PM");
    const day = parseTimeOffSpan({ start: "2026-09-14" }, NY)!;
    expect(formatTimeOffSpan(day.startsAt, day.endsAt, NY)).toBe("Sep 14 · All day");
    const week = parseTimeOffSpan({ start: "2026-09-14", end: "2026-09-18" }, NY)!;
    expect(formatTimeOffSpan(week.startsAt, week.endsAt, NY)).toBe("Sep 14 – Sep 18 · All day");
  });
});

describe("schedule grid geometry (TOK-78)", () => {
  it("shows a working day by default and stretches for an early or late window", () => {
    expect(scheduleBounds([])).toEqual({ startMinutes: 7 * 60, endMinutes: 20 * 60 });
    expect(scheduleBounds([{ startMinutes: 5 * 60 + 30, endMinutes: 21 * 60 + 30 }])).toEqual({
      startMinutes: 5 * 60,
      endMinutes: 22 * 60,
    });
    expect(scheduleHourTicks({ startMinutes: 7 * 60, endMinutes: 9 * 60 })).toEqual([420, 480, 540]);
  });

  it("places a block where the hours say it is", () => {
    const bounds = { startMinutes: 8 * 60, endMinutes: 20 * 60 };
    expect(blockPlacement({ startMinutes: 8 * 60, endMinutes: 14 * 60 }, bounds)).toEqual({
      top: 0,
      height: 50,
    });
    // A window running past the visible edge is clipped, never drawn off the grid.
    expect(blockPlacement({ startMinutes: 19 * 60, endMinutes: 23 * 60 }, bounds).height).toBeCloseTo(
      (60 / 720) * 100,
    );
  });

  it("snaps the pointer to the half-hour and stays inside the grid", () => {
    const bounds = { startMinutes: 8 * 60, endMinutes: 20 * 60 };
    expect(minutesAtRatio(0, bounds)).toBe(480);
    expect(minutesAtRatio(1, bounds)).toBe(1200);
    expect(minutesAtRatio(0.5, bounds)).toBe(840);
    expect(minutesAtRatio(2, bounds)).toBe(1200);
    expect(minutesAtRatio(-1, bounds)).toBe(480);
  });

  it("turns a tap into an hour and a drag into what was dragged", () => {
    const bounds = { startMinutes: 8 * 60, endMinutes: 20 * 60 };
    expect(paintedRange(600, 600, bounds)).toEqual({ startMinutes: 600, endMinutes: 660 });
    expect(paintedRange(600, 840, bounds)).toEqual({ startMinutes: 600, endMinutes: 840 });
    // Dragging upward paints the same window as dragging down.
    expect(paintedRange(840, 600, bounds)).toEqual({ startMinutes: 600, endMinutes: 840 });
    // A tap on the very last tick still fits an hour by backing off the bottom edge.
    expect(paintedRange(1200, 1200, bounds)).toEqual({ startMinutes: 1140, endMinutes: 1200 });
  });

  it("drops '+ Add window' into the first gap wide enough to hold one", () => {
    const bounds = { startMinutes: 9 * 60, endMinutes: 17 * 60 };
    expect(nextFreeWindow([], bounds)).toEqual({ startMinutes: 540, endMinutes: 600 });
    expect(
      nextFreeWindow([{ startMinutes: 540, endMinutes: 720 }], bounds),
    ).toEqual({ startMinutes: 720, endMinutes: 780 });
    // A day already open to midnight has nowhere left to put one.
    expect(nextFreeWindow([{ startMinutes: 0, endMinutes: 24 * 60 }], bounds)).toBeNull();
  });
});
