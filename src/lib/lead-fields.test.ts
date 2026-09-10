import { describe, expect, it } from "vitest";
import {
  INSURANCE_OPTIONS,
  LEAD_FIELDS,
  LEAD_FIELDS_BY_KEY,
  LEAD_FIELD_KEYS,
  LEAD_SOURCES,
  SERVICE_TYPES,
  eddMonthKey,
  eddMonthLabel,
  eddWithWeeks,
  followUpSortKey,
  followUpState,
  gestationFromEdd,
  insuranceLabel,
  lastContactLabel,
  leadFieldsFor,
  leadSourceLabel,
  normalizeInsurance,
  normalizeSource,
  parseLeadFields,
  serviceTypeLabel,
} from "./lead-fields";

const TODAY = new Date("2026-09-10T12:00:00Z");

describe("field defs are the single source of truth", () => {
  it("defines every declared key exactly once", () => {
    expect(LEAD_FIELDS.map((field) => field.key).sort()).toEqual([...LEAD_FIELD_KEYS].sort());
    expect(Object.keys(LEAD_FIELDS_BY_KEY).sort()).toEqual([...LEAD_FIELD_KEYS].sort());
  });

  it("gives every select its options and every field a label", () => {
    for (const field of LEAD_FIELDS) {
      expect(field.label.trim()).toBeTruthy();
      expect(field.column.trim()).toBeTruthy();
      if (field.type === "select") expect(field.options?.length).toBeGreaterThan(0);
    }
  });

  it("keeps agency machinery off a doula's form (TOK-34)", () => {
    const doulaKeys = leadFieldsFor("doula").map((field) => field.key);
    expect(doulaKeys).not.toContain("source");
    expect(doulaKeys).not.toContain("intakeRef");
    expect(leadFieldsFor("agency").map((field) => field.key)).toContain("source");
  });
});

describe("parseLeadFields", () => {
  const post = (values: Record<string, string>) => (key: string) =>
    key in values ? values[key] : undefined;

  it("reads text, date and select fields", () => {
    expect(
      parseLeadFields(
        post({ hospital: " Inova Fairfax ", followUpDueOn: "2026-09-20", serviceType: "lactation" }),
      ),
    ).toEqual({
      hospital: "Inova Fairfax",
      followUpDueOn: "2026-09-20",
      serviceType: "lactation",
    });
  });

  it("drops a select value that is not one of its own options", () => {
    expect(parseLeadFields(post({ serviceType: "astrology" }))).toEqual({ serviceType: null });
  });

  it("drops a malformed date rather than storing it", () => {
    expect(parseLeadFields(post({ consultDate: "next tuesday" }))).toEqual({ consultDate: null });
  });

  it("leaves absent fields alone but clears present-but-empty ones", () => {
    expect(parseLeadFields(post({ city: "" }))).toEqual({ city: null });
    expect(parseLeadFields(post({}))).toEqual({});
  });

  it("ignores agency-only keys posted by a doula", () => {
    const parsed = parseLeadFields(post({ source: "referral", intakeRef: "X-1", city: "Vienna" }), "doula");
    expect(parsed).toEqual({ city: "Vienna" });
  });
});

describe("gestation", () => {
  it("reads an EDD as weeks and days the way a chart writes it", () => {
    // 280-day term: 35w2d means 33 days short of the due date.
    const edd = "2026-10-13";
    expect(gestationFromEdd(edd, TODAY)?.label).toBe("35w2d");
    expect(eddWithWeeks(edd, TODAY)).toBe("EDD Oct 13 · 35w2d");
  });

  it("keeps counting past the due date — 41w0d is a real number", () => {
    expect(gestationFromEdd("2026-09-03", TODAY)?.label).toBe("41w0d");
  });

  it("falls back to the plain date when gestation is out of any sane range", () => {
    expect(eddWithWeeks("2029-01-01", TODAY)).toBe("EDD Jan 1");
  });

  it("returns null for a missing or malformed date", () => {
    expect(eddWithWeeks(null, TODAY)).toBeNull();
    expect(gestationFromEdd("not-a-date", TODAY)).toBeNull();
  });
});

describe("follow-up state", () => {
  it("calls a past date overdue and says by how much", () => {
    const state = followUpState("2026-09-06", TODAY);
    expect(state.state).toBe("overdue");
    expect(state.daysOut).toBe(-4);
    expect(state.label).toContain("Overdue 4d");
  });

  it("separates today from upcoming", () => {
    expect(followUpState("2026-09-10", TODAY).state).toBe("today");
    expect(followUpState("2026-09-20", TODAY).state).toBe("upcoming");
  });

  it("says so plainly when nothing is scheduled", () => {
    expect(followUpState(null, TODAY)).toEqual({
      state: "none",
      label: "No follow-up set",
      daysOut: null,
    });
  });

  it("sorts overdue first, then soonest, then the undated", () => {
    const dates = ["2026-09-20", null, "2026-09-06", "2026-09-10"];
    const sorted = [...dates].sort(
      (a, b) => followUpSortKey(a, TODAY) - followUpSortKey(b, TODAY),
    );
    expect(sorted).toEqual(["2026-09-06", "2026-09-10", "2026-09-20", null]);
  });
});

describe("last contact", () => {
  it("reads recent contact in days", () => {
    expect(lastContactLabel(new Date("2026-09-07T12:00:00Z"), TODAY)).toBe("3d ago");
    expect(lastContactLabel(new Date("2026-09-09T12:00:00Z"), TODAY)).toBe("1d ago");
    expect(lastContactLabel(new Date("2026-09-10T09:00:00Z"), TODAY)).toBe("Today");
  });

  it("switches to a date once the gap stops being useful in days", () => {
    expect(lastContactLabel(new Date("2026-06-01T12:00:00Z"), TODAY)).toBe("Jun 1");
  });

  it("never pretends contact happened", () => {
    expect(lastContactLabel(null, TODAY)).toBe("No contact logged");
    expect(lastContactLabel("nonsense", TODAY)).toBe("No contact logged");
  });
});

describe("picker normalisation", () => {
  it("reads the legacy `web` source as website rather than dropping it", () => {
    expect(normalizeSource("web")).toBe("website");
    expect(leadSourceLabel("web")).toBe("Website");
  });

  it("keeps every canonical source and falls back to other", () => {
    for (const source of LEAD_SOURCES) expect(normalizeSource(source)).toBe(source);
    expect(normalizeSource("carrier pigeon")).toBe("other");
  });

  it("reads insurance as three honest states", () => {
    expect(normalizeInsurance("Yes")).toBe("yes");
    expect(normalizeInsurance("self-pay")).toBe("no");
    expect(normalizeInsurance(null)).toBe("unknown");
    expect(insuranceLabel(null)).toBe("Insurance unknown");
    expect(INSURANCE_OPTIONS).toHaveLength(3);
  });

  it("labels every service type and stays quiet on an unset one", () => {
    for (const service of SERVICE_TYPES) expect(serviceTypeLabel(service)).toBeTruthy();
    expect(serviceTypeLabel(null)).toBe("");
  });
});

describe("EDD month bucketing", () => {
  it("keys and labels a month for the board filter", () => {
    expect(eddMonthKey("2026-10-13")).toBe("2026-10");
    expect(eddMonthLabel("2026-10")).toBe("Oct 2026");
    expect(eddMonthKey(null)).toBeNull();
  });
});
