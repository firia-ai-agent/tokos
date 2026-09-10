import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIMEZONE,
  clientVisitLabel,
  durationMinutes,
  expandAvailabilitySlots,
  formatDuration,
  groupByDay,
  halfHourOptions,
  isMissedVisit,
  isSlotOpen,
  openSlots,
  parseAvailabilityWindow,
  splitSlots,
  timezoneLabel,
  TIME_OFF_TYPE,
  zonedParts,
} from "./calendar";

const MONDAY = 1;

/** Mon 10:00–12:00 in the practice's own zone — two one-hour slots. */
const mondayMorning = [
  { weekday: MONDAY, startMinutes: 600, endMinutes: 720, timezone: DEFAULT_TIMEZONE },
];

const et = (at: Date) => zonedParts(at, DEFAULT_TIMEZONE);

describe("expandAvailabilitySlots (TOK-26)", () => {
  it("emits the rule's wall-clock hours in America/New_York, not the server's UTC", () => {
    // Sun 2026-09-06 20:00 EDT — deliberately a UTC instant whose ET date differs.
    const from = new Date("2026-09-07T00:00:00Z");
    const slots = expandAvailabilitySlots({ rules: mondayMorning, from, days: 3 });

    expect(slots).toHaveLength(2);
    expect(slots.map((slot) => et(slot.startsAt).minutes)).toEqual([600, 660]);
    expect(slots.every((slot) => et(slot.startsAt).weekday === MONDAY)).toBe(true);
    // 10:00 EDT is 14:00 UTC. A naive startOfDay would have produced 10:00 UTC.
    expect(slots[0].startsAt.toISOString()).toBe("2026-09-07T14:00:00.000Z");
  });

  it("holds 10:00 ET across the spring-forward boundary", () => {
    // US DST starts Sun 2026-03-08, so this window straddles it: Mar 2 is EST,
    // Mar 9 is EDT. The UTC offset moves; the wall clock must not.
    const from = new Date("2026-03-02T00:00:00Z");
    const slots = expandAvailabilitySlots({ rules: mondayMorning, from, days: 14 });

    expect(slots).toHaveLength(4);
    for (const slot of slots) {
      expect(et(slot.startsAt).weekday).toBe(MONDAY);
      expect([600, 660]).toContain(et(slot.startsAt).minutes);
    }
    expect(slots[0].startsAt.toISOString()).toBe("2026-03-02T15:00:00.000Z"); // EST, UTC-5
    expect(slots[2].startsAt.toISOString()).toBe("2026-03-09T14:00:00.000Z"); // EDT, UTC-4
  });

  it("holds 10:00 ET across the fall-back boundary", () => {
    // US DST ends Sun 2026-11-01: Oct 26 is EDT, Nov 2 is EST.
    const from = new Date("2026-10-24T00:00:00Z");
    const slots = expandAvailabilitySlots({ rules: mondayMorning, from, days: 14 });

    expect(slots).toHaveLength(4);
    for (const slot of slots) {
      expect(et(slot.startsAt).weekday).toBe(MONDAY);
      expect([600, 660]).toContain(et(slot.startsAt).minutes);
    }
    expect(slots[0].startsAt.toISOString()).toBe("2026-10-26T14:00:00.000Z"); // EDT, UTC-4
    expect(slots[2].startsAt.toISOString()).toBe("2026-11-02T15:00:00.000Z"); // EST, UTC-5
  });
});

describe("openSlots", () => {
  it("drops a slot a booked event overlaps", () => {
    const from = new Date("2026-09-07T00:00:00Z");
    const busy = [
      { startsAt: new Date("2026-09-07T14:30:00Z"), endsAt: new Date("2026-09-07T15:00:00Z") },
    ];
    const slots = openSlots({ rules: mondayMorning, busy, from, days: 3 });

    expect(slots.map((slot) => slot.startsAt.toISOString())).toEqual([
      "2026-09-07T15:00:00.000Z",
    ]);
  });

  it("offers nothing on a day the practice took off (TOK-54)", () => {
    const from = new Date("2026-09-07T00:00:00Z");
    // Mon 2026-09-07, midnight to midnight EDT.
    const timeOff = [
      { startsAt: new Date("2026-09-07T04:00:00Z"), endsAt: new Date("2026-09-08T04:00:00Z") },
    ];
    expect(openSlots({ rules: mondayMorning, busy: [], timeOff, from, days: 3 })).toEqual([]);
    // The same rules a week later are untouched by that one day off.
    expect(openSlots({ rules: mondayMorning, busy: [], timeOff, from, days: 10 })).toHaveLength(2);
  });
});

describe("isSlotOpen — the booking gate", () => {
  const now = new Date("2026-09-07T00:00:00Z");
  const open = {
    startsAt: new Date("2026-09-07T14:00:00Z"),
    endsAt: new Date("2026-09-07T15:00:00Z"),
  };

  it("accepts a slot the rules actually generate", () => {
    expect(isSlotOpen({ rules: mondayMorning, busy: [], ...open, now, days: 3 })).toEqual({
      ok: true,
    });
  });

  it("rejects a time already in the past", () => {
    expect(
      isSlotOpen({
        rules: mondayMorning,
        busy: [],
        startsAt: new Date("2026-08-31T14:00:00Z"),
        endsAt: new Date("2026-08-31T15:00:00Z"),
        now,
        days: 3,
      }),
    ).toEqual({ ok: false, reason: "past" });
  });

  it("rejects a time outside the availability rules", () => {
    // 13:00 EDT on the right Monday, but the rule closes at noon.
    expect(
      isSlotOpen({
        rules: mondayMorning,
        busy: [],
        startsAt: new Date("2026-09-07T17:00:00Z"),
        endsAt: new Date("2026-09-07T18:00:00Z"),
        now,
        days: 3,
      }),
    ).toEqual({ ok: false, reason: "outside_availability" });
  });

  it("rejects an open window something already booked overlaps", () => {
    const busy = [
      { startsAt: new Date("2026-09-07T14:30:00Z"), endsAt: new Date("2026-09-07T15:30:00Z") },
    ];
    expect(isSlotOpen({ rules: mondayMorning, busy, ...open, now, days: 3 })).toEqual({
      ok: false,
      reason: "already_booked",
    });
  });

  it("rejects a window a day off closed, and says the window is not open (TOK-54)", () => {
    // Not "already booked": nobody took the hour, the practice closed the day.
    const timeOff = [
      { startsAt: new Date("2026-09-07T04:00:00Z"), endsAt: new Date("2026-09-08T04:00:00Z") },
    ];
    expect(isSlotOpen({ rules: mondayMorning, busy: [], timeOff, ...open, now, days: 3 })).toEqual({
      ok: false,
      reason: "outside_availability",
    });
  });
});

describe("day grouping (TOK-33 C1/C10)", () => {
  const at = (iso: string) => ({ startsAt: new Date(iso) });

  it("buckets by the practice's day, not the server's UTC day", () => {
    // 21:00 EDT Mon and 00:30 UTC are the same evening in New York, one UTC day apart.
    const groups = groupByDay(
      [at("2026-09-08T01:00:00Z"), at("2026-09-08T01:30:00Z"), at("2026-09-08T14:00:00Z")],
      DEFAULT_TIMEZONE,
      new Date("2026-09-01T12:00:00Z"),
    );

    expect(groups.map((group) => group.key)).toEqual(["2026-09-07", "2026-09-08"]);
    expect(groups.map((group) => group.items.length)).toEqual([2, 1]);
  });

  it("labels today and tomorrow relative to the practice's clock", () => {
    // 22:00 EDT Wed — already Thursday in UTC, still Wednesday for the family.
    const now = new Date("2026-09-10T02:00:00Z");
    const groups = groupByDay(
      [at("2026-09-10T03:00:00Z"), at("2026-09-10T18:00:00Z"), at("2026-09-11T18:00:00Z")],
      DEFAULT_TIMEZONE,
      now,
    );

    expect(groups.map((group) => group.label)).toEqual([
      "Today",
      "Tomorrow",
      "Friday, Sep 11",
    ]);
  });

  it("keeps the caller's order inside each day", () => {
    const groups = groupByDay(
      [at("2026-09-07T14:00:00Z"), at("2026-09-07T15:00:00Z")],
      DEFAULT_TIMEZONE,
      new Date("2026-09-01T12:00:00Z"),
    );
    expect(groups[0].items.map((item) => item.startsAt.toISOString())).toEqual([
      "2026-09-07T14:00:00.000Z",
      "2026-09-07T15:00:00.000Z",
    ]);
  });
});

describe("splitSlots — 'More times'", () => {
  const slots = [1, 2, 3, 4, 5, 6, 7];

  it("shows five and hides the rest by default", () => {
    expect(splitSlots(slots)).toEqual({ visible: [1, 2, 3, 4, 5], more: [6, 7] });
  });

  it("hides nothing when the day list is already short", () => {
    expect(splitSlots([1, 2])).toEqual({ visible: [1, 2], more: [] });
  });
});

describe("visit card details (TOK-33 C4/C14)", () => {
  it("reports duration in the units a family plans around", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(60)).toBe("1 hr");
    expect(formatDuration(90)).toBe("1 hr 30 min");
  });

  it("measures duration from the event's own start and end", () => {
    expect(
      durationMinutes(new Date("2026-09-07T14:00:00Z"), new Date("2026-09-07T14:45:00Z")),
    ).toBe(45);
  });

  it("names the clock so a time is never ambiguous", () => {
    expect(timezoneLabel(new Date("2026-09-07T14:00:00Z"))).toBe("EDT");
    expect(timezoneLabel(new Date("2026-01-07T14:00:00Z"))).toBe("EST");
  });

  it("softens scheduling jargon families never asked for", () => {
    expect(clientVisitLabel({ title: "Fit consult", type: "consult" })).toBe(
      "Introductory consult",
    );
    expect(clientVisitLabel({ title: "Prenatal visit", type: "visit" })).toBe("Prenatal visit");
    expect(clientVisitLabel({ title: "", type: "consult" })).toBe("Introductory consult");
  });
});

describe("availability windows (TOK-33 C8)", () => {
  it("offers half-hour choices, not raw hours", () => {
    const options = halfHourOptions(0, 23 * 60 + 30);
    expect(options).toHaveLength(48);
    expect(options[0]).toEqual({ value: 0, label: "12:00 AM" });
    expect(options[19]).toEqual({ value: 570, label: "9:30 AM" });
    expect(options.at(-1)).toEqual({ value: 1410, label: "11:30 PM" });
  });

  it("lets an end window reach midnight", () => {
    expect(halfHourOptions(30, 24 * 60).at(-1)).toEqual({ value: 1440, label: "Midnight" });
  });

  it("accepts a clean half-hour window from the form", () => {
    expect(parseAvailabilityWindow("570", "960")).toEqual({
      startMinutes: 570,
      endMinutes: 960,
    });
  });

  it("drops windows the calendar could never expand", () => {
    expect(parseAvailabilityWindow("960", "570")).toBeNull(); // inverted
    expect(parseAvailabilityWindow("600", "600")).toBeNull(); // empty
    expect(parseAvailabilityWindow("605", "960")).toBeNull(); // off the half-hour grid
    expect(parseAvailabilityWindow("-60", "960")).toBeNull();
    expect(parseAvailabilityWindow("600", "1500")).toBeNull(); // past midnight
    expect(parseAvailabilityWindow("", "960")).toBeNull();
    expect(parseAvailabilityWindow("ten", "960")).toBeNull();
  });

  it("round-trips a saved window back into the select's options", () => {
    const window = parseAvailabilityWindow("570", "1440");
    expect(window).not.toBeNull();
    const values = halfHourOptions(30, 24 * 60).map((option) => option.value);
    expect(values).toContain(window!.endMinutes);
  });
});

/* ------------------------------------------------------------------- TOK-58 */

describe("isMissedVisit", () => {
  const NOW = new Date("2026-09-10T12:00:00Z");
  const visit = (over: Partial<Parameters<typeof isMissedVisit>[0]> = {}) => ({
    type: "consult",
    status: "scheduled",
    endsAt: new Date("2026-09-08T15:00:00Z"),
    ...over,
  });

  it("counts a past visit nobody ever resolved", () => {
    expect(isMissedVisit(visit(), NOW)).toBe(true);
    expect(isMissedVisit(visit({ status: "unconfirmed" }), NOW)).toBe(true);
  });

  it("counts a no-show whatever the clock says", () => {
    expect(isMissedVisit(visit({ status: "no_show" }), NOW)).toBe(true);
    expect(
      isMissedVisit(visit({ status: "no_show", endsAt: new Date("2026-09-20T15:00:00Z") }), NOW),
    ).toBe(true);
  });

  it("leaves a booking that has not happened yet alone", () => {
    expect(isMissedVisit(visit({ endsAt: new Date("2026-09-20T15:00:00Z") }), NOW)).toBe(false);
  });

  it("never counts a cancellation, a completed visit, or a day off", () => {
    expect(isMissedVisit(visit({ status: "canceled" }), NOW)).toBe(false);
    expect(isMissedVisit(visit({ status: "completed" }), NOW)).toBe(false);
    expect(isMissedVisit(visit({ type: TIME_OFF_TYPE }), NOW)).toBe(false);
  });

  it("reads a stored timestamp string, and shrugs at an unusable one", () => {
    expect(isMissedVisit(visit({ endsAt: "2026-09-08T15:00:00Z" }), NOW)).toBe(true);
    expect(isMissedVisit(visit({ endsAt: "not a date" }), NOW)).toBe(false);
    expect(isMissedVisit(visit({ status: null }), NOW)).toBe(false);
  });
});
