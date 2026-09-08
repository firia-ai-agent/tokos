import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIMEZONE,
  expandAvailabilitySlots,
  isSlotOpen,
  openSlots,
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
});
