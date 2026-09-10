import { describe, expect, it } from "vitest";
import {
  EMPTY_LEAD_QUERY,
  eddMonthOptions,
  filterLeadRows,
  isFiltered,
  leadBoardCounts,
  leadBoardView,
  ownerOptions,
  parseLeadQuery,
  sortLeadRows,
  type LeadRowLike,
} from "./lead-board";
import type { PipelineStageName } from "./pipeline";

const TODAY = new Date("2026-09-10T12:00:00Z");

function row(over: Partial<LeadRowLike["client"]> & { id: string; displayName: string }, rest: Partial<LeadRowLike> = {}): LeadRowLike {
  return {
    client: {
      email: `${over.id}@example.invalid`,
      phone: null,
      serviceType: null,
      edd: null,
      source: "website",
      insurance: "unknown",
      followUpDueOn: null,
      lastContactAt: null,
      reviewed: true,
      ownerUserId: null,
      ...over,
    },
    stage: "outreach_sent" as PipelineStageName,
    stageEnteredAt: new Date("2026-09-01T12:00:00Z"),
    primaryDoulaUserId: "doula-1",
    lastNoteAt: new Date("2026-09-02T12:00:00Z"),
    ...rest,
  };
}

const overdue = row({ id: "overdue", displayName: "Avery Overdue", followUpDueOn: "2026-09-04" });
const dueToday = row({ id: "today", displayName: "Brynn Today", followUpDueOn: "2026-09-10" });
const soon = row({ id: "soon", displayName: "Camille Soon", followUpDueOn: "2026-09-25" });
const undated = row({ id: "undated", displayName: "Dalia Undated" });

describe("default sort — who slips today?", () => {
  it("puts overdue on top, then soonest, then the undated", () => {
    const sorted = sortLeadRows([undated, soon, dueToday, overdue], TODAY);
    expect(sorted.map((r) => r.client.id)).toEqual(["overdue", "today", "soon", "undated"]);
  });

  it("breaks ties by name so the order is stable between renders", () => {
    const a = row({ id: "a", displayName: "Zara", followUpDueOn: "2026-09-12" });
    const b = row({ id: "b", displayName: "Anya", followUpDueOn: "2026-09-12" });
    expect(sortLeadRows([a, b], TODAY).map((r) => r.client.displayName)).toEqual(["Anya", "Zara"]);
  });

  it("keeps the most overdue above the merely overdue", () => {
    const worse = row({ id: "worse", displayName: "Worse", followUpDueOn: "2026-08-01" });
    expect(sortLeadRows([overdue, worse], TODAY).map((r) => r.client.id)).toEqual([
      "worse",
      "overdue",
    ]);
  });
});

describe("filters", () => {
  const rows = [
    row(
      {
        id: "1",
        displayName: "Amara Alderman",
        phone: "(571) 555-1000",
        serviceType: "birth_support",
        edd: "2026-10-13",
        source: "referral",
        insurance: "yes",
        ownerUserId: "maya",
        followUpDueOn: "2026-09-04",
        reviewed: false,
      },
      { stage: "consult_done", lastNoteAt: null },
    ),
    row(
      {
        id: "2",
        displayName: "Brynn Brightwater",
        serviceType: "postpartum",
        edd: "2026-11-02",
        // Legacy free-text value, from before the picker existed.
        source: "web",
      },
      { stage: "fit_confirmed", primaryDoulaUserId: null },
    ),
    row({ id: "3", displayName: "Camille Castellan", source: "event", insurance: "no" }),
  ];

  const q = (over: Partial<typeof EMPTY_LEAD_QUERY>) => ({ ...EMPTY_LEAD_QUERY, ...over });
  const ids = (over: Partial<typeof EMPTY_LEAD_QUERY>) =>
    filterLeadRows(rows, q(over), TODAY).map((r) => r.client.id);

  it("searches name, email and phone", () => {
    expect(ids({ q: "brightwater" })).toEqual(["2"]);
    expect(ids({ q: "555-1000" })).toEqual(["1"]);
    expect(ids({ q: "3@example" })).toEqual(["3"]);
  });

  it("filters by stage, service, source, insurance and EDD month", () => {
    expect(ids({ stage: "fit_confirmed" })).toEqual(["2"]);
    expect(ids({ service: "postpartum" })).toEqual(["2"]);
    expect(ids({ source: "referral" })).toEqual(["1"]);
    expect(ids({ insurance: "no" })).toEqual(["3"]);
    expect(ids({ eddMonth: "2026-11" })).toEqual(["2"]);
  });

  it("normalises legacy source values so `web` rows still match Website", () => {
    expect(ids({ source: "website" })).toEqual(["2"]);
  });

  it("filters by owner", () => {
    expect(ids({ owner: "maya" })).toEqual(["1"]);
  });

  it("finds the unmatched, the overdue and the unreviewed", () => {
    expect(ids({ unmatched: true })).toEqual(["2"]);
    expect(ids({ overdue: true })).toEqual(["1"]);
    expect(ids({ unreviewed: true })).toEqual(["1"]);
  });

  it("tabs narrow the same way the checkboxes do", () => {
    expect(ids({ tab: "unmatched" })).toEqual(["2"]);
    // Row 1 is overdue, unreviewed and a consult_done with no note; row 2 is unmatched.
    expect(ids({ tab: "attention" })).toEqual(["1", "2"]);
    expect(ids({ tab: "all" })).toEqual(["1", "2", "3"]);
  });

  it("counts the whole scope, not the filtered view", () => {
    expect(leadBoardCounts(rows, TODAY)).toEqual({
      total: 3,
      attention: 2,
      unmatched: 1,
      overdue: 1,
    });
  });

  it("filters then sorts in one call", () => {
    expect(leadBoardView(rows, q({ tab: "attention" }), TODAY).map((r) => r.client.id)).toEqual([
      "1",
      "2",
    ]);
  });
});

describe("query parsing", () => {
  it("reads the board's URL state", () => {
    expect(parseLeadQuery({ tab: "attention", q: " noor ", overdue: "1" })).toMatchObject({
      tab: "attention",
      q: "noor",
      overdue: true,
    });
  });

  it("falls back rather than filtering to nothing on junk", () => {
    expect(parseLeadQuery({ tab: "nonsense" }).tab).toBe("all");
    expect(parseLeadQuery({ overdue: "maybe" }).overdue).toBe(false);
    expect(parseLeadQuery({})).toEqual(EMPTY_LEAD_QUERY);
  });

  it("takes the first value when a param repeats", () => {
    expect(parseLeadQuery({ stage: ["new_lead", "closed"] }).stage).toBe("new_lead");
  });

  it("knows whether anything is narrowing the list", () => {
    expect(isFiltered(EMPTY_LEAD_QUERY)).toBe(false);
    expect(isFiltered({ ...EMPTY_LEAD_QUERY, unreviewed: true })).toBe(true);
    expect(isFiltered({ ...EMPTY_LEAD_QUERY, tab: "attention" })).toBe(true);
  });
});

describe("filter option lists come from the rows on screen", () => {
  it("offers only the EDD months present, oldest first", () => {
    const rows = [
      row({ id: "a", displayName: "A", edd: "2026-11-02" }),
      row({ id: "b", displayName: "B", edd: "2026-10-13" }),
      row({ id: "c", displayName: "C" }),
    ];
    expect(eddMonthOptions(rows)).toEqual(["2026-10", "2026-11"]);
  });

  it("offers only owners who own something", () => {
    const rows = [
      row({ id: "a", displayName: "A", ownerUserId: "maya" }),
      row({ id: "b", displayName: "B" }),
    ];
    expect(ownerOptions(rows, (id) => (id === "maya" ? "Maya Chen" : null))).toEqual([
      { value: "maya", label: "Maya Chen" },
    ]);
  });
});
