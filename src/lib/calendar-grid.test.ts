import { describe, expect, it } from "vitest";
import { subtractTimeOff, type Slot } from "@/lib/calendar";
import {
  MAX_TIME_OFF_DAYS,
  bucketByDay,
  formatTimeOffRange,
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
