import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The calendar rebuild (TOK-33) is mostly copy and shape, and neither has a runtime that
 * would notice a regression. These assertions hold the three booking surfaces to the
 * rules the ticket set: name the doula, never a role; group times by day instead of
 * dumping radios; and always leave a family somewhere to go when there is nothing to
 * book. Same approach as `scripts/seed-copy.test.ts`, applied to the pages.
 */
const read = (...parts: string[]) => readFileSync(join(process.cwd(), "src", ...parts), "utf8");

const clientCalendar = read("app", "(client)", "portal", "calendar", "page.tsx");
const doulaCalendar = read("app", "(doula)", "doula", "calendar", "page.tsx");
const publicBook = read("app", "(public)", "p", "[slug]", "book", "page.tsx");
const slotPicker = read("components", "brand", "slot-picker.tsx");

describe("client /portal/calendar (TOK-33 C1–C7, C14)", () => {
  it("titles the page with the person the family is seeing (C6)", () => {
    expect(clientCalendar).toContain("Your visits with {doula.firstName}");
  });

  it("invites a first booking instead of reporting emptiness (C2)", () => {
    expect(clientCalendar).toContain('title="No visits yet"');
    expect(clientCalendar).toContain("Choose a time that works with ${doula.firstName}");
  });

  it("says why there is nothing to pick and where to go next (C3)", () => {
    expect(clientCalendar).toContain("hasn&rsquo;t opened times yet");
    expect(clientCalendar).toContain("message {doula.firstName}");
  });

  it("gives a booked visit its who / how long / which clock / what (C4)", () => {
    expect(clientCalendar).toContain("with {doula.firstName}");
    expect(clientCalendar).toContain("formatDuration(durationMinutes(");
    expect(clientCalendar).toContain("timezoneLabel(event.startsAt, timeZone)");
    expect(clientCalendar).toContain("clientVisitLabel(");
  });

  it("offers the one change a family can make today (C5)", () => {
    expect(clientCalendar).toContain("Message {doula.firstName} to change");
    expect(clientCalendar).toContain('href="/portal/messages"');
  });

  it("keeps the named booking heading and drops the flat radio list (C1, C14)", () => {
    expect(clientCalendar).toContain("Book with {doula.firstName}");
    expect(clientCalendar).toContain("<SlotPicker");
    expect(clientCalendar).not.toContain('type="radio"');
  });
});

describe("doula /doula/calendar (TOK-33 C8–C11)", () => {
  it("edits availability with half-hour selects, not raw hour integers (C8)", () => {
    expect(doulaCalendar).toContain("halfHourOptions(");
    expect(doulaCalendar).not.toContain('type="number"');
  });

  it("names the clock the windows are kept in (C8)", () => {
    expect(doulaCalendar).toContain("timezoneLabel(now, timeZone)");
  });

  it("calls the schedule what it is (C9)", () => {
    expect(doulaCalendar).toContain("<CardTitle>Upcoming visits</CardTitle>");
    expect(doulaCalendar).not.toContain("My schedule");
  });

  it("groups the week by day and clicks through to the family (C10)", () => {
    expect(doulaCalendar).toContain("groupByDay(upcoming, timeZone, now)");
    expect(doulaCalendar).toContain("`/doula/clients/${entry.clientId}`");
  });

  it("shows what families would actually see (C11)", () => {
    expect(doulaCalendar).toContain("Families see");
  });
});

describe("public /p/[slug]/book (TOK-33 C12–C13)", () => {
  it("uses the same picker as the portal rather than its own radio dump (C12)", () => {
    expect(publicBook).toContain("<SlotPicker");
    expect(publicBook).not.toContain('type="radio"');
  });

  it("shows the practice's zone rather than the server's (C12)", () => {
    expect(publicBook).toContain("organizationTimezone(row.profile.organizationId)");
  });

  it("keeps the no-lead entry copy (C13 / A3)", () => {
    expect(publicBook).toContain("This starts your care conversation");
    expect(publicBook).not.toMatch(/opens a lead/i);
  });
});

describe("shared slot picker", () => {
  it("shows a handful of times and hides the rest (C1)", () => {
    expect(slotPicker).toContain("splitSlots(slots, visibleCount)");
    expect(slotPicker).toContain("More times (");
  });

  it("stays a server render — a picker needs no client bundle", () => {
    expect(slotPicker).not.toContain('"use client"');
  });
});

describe("client-facing calendar copy never falls back to a role", () => {
  it("says the doula's name, not 'your doula' (TOK-38 B11)", () => {
    for (const source of [clientCalendar, publicBook, slotPicker]) {
      expect(source.toLowerCase()).not.toContain("your doula");
    }
  });

  it("keeps internal triage words off the family's screen (C14)", () => {
    expect(clientCalendar).not.toMatch(/fit consult|fit window/i);
  });
});
