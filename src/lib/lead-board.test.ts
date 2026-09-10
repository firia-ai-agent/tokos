import { describe, expect, it } from "vitest";
import {
  EMPTY_LEAD_QUERY,
  eddMonthOptions,
  filterLeadRows,
  isFiltered,
  leadBoardCounts,
  leadBoardView,
  moreFiltersOpen,
  ownerOptions,
  parseLeadQuery,
  secondaryFilterCount,
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
      // Spoken to this week: a hand-built row is "clean" only if it clears TOK-58's
      // no-contact rule too.
      lastContactAt: new Date("2026-09-08T12:00:00Z"),
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
    // Row 1 is overdue, unreviewed and a consult_done with no note; row 2 is unmatched;
    // row 3 is clean but sits in the funnel with no next step planned, which is the
    // intake nudge (TOK-53).
    expect(ids({ tab: "attention" })).toEqual(["1", "2", "3"]);
    expect(ids({ tab: "all" })).toEqual(["1", "2", "3"]);
  });

  it("counts the whole scope, not the filtered view", () => {
    expect(leadBoardCounts(rows, TODAY)).toEqual({
      total: 3,
      attention: 3,
      unmatched: 1,
      overdue: 1,
    });
  });

  it("filters then sorts in one call", () => {
    expect(leadBoardView(rows, q({ tab: "attention" }), TODAY).map((r) => r.client.id)).toEqual([
      "1",
      "2",
      "3",
    ]);
  });

  /** TOK-53: money reaches the board's rules through the row, not a second alert list. */
  it("puts a family with an unsigned agreement or an open invoice in Needs attention", () => {
    const quiet = row(
      { id: "money", displayName: "Jordan Rivera", followUpDueOn: "2026-09-25" },
      { stage: "fit_confirmed" },
    );
    expect(filterLeadRows([quiet], q({ tab: "attention" }), TODAY)).toEqual([]);

    const owing = { ...quiet, ledger: { unsignedCents: 280000, outstandingCents: 90000 } };
    expect(filterLeadRows([owing], q({ tab: "attention" }), TODAY).map((r) => r.client.id)).toEqual([
      "money",
    ]);
    expect(leadBoardCounts([owing], TODAY).attention).toBe(1);
  });

  /** TOK-58: the four new facts reach the same rules down the same one path. */
  it("puts a quiet, unread, unfinished or missed-visit family in Needs attention", () => {
    const quiet = row(
      { id: "maya", displayName: "Maya Chen", followUpDueOn: "2026-09-25" },
      { stage: "active_care" },
    );
    expect(filterLeadRows([quiet], q({ tab: "attention" }), TODAY)).toEqual([]);

    for (const fact of [
      { unreadInboundCount: 1 },
      { incompleteFormCount: 2 },
      { missedVisitCount: 1 },
    ]) {
      const flagged = { ...quiet, ...fact };
      expect(
        filterLeadRows([flagged], q({ tab: "attention" }), TODAY).map((r) => r.client.id),
      ).toEqual(["maya"]);
      expect(leadBoardCounts([flagged], TODAY).attention).toBe(1);
    }

    // And the silence itself, measured off the client row the board already carries.
    const gone = row(
      {
        id: "maya",
        displayName: "Maya Chen",
        followUpDueOn: "2026-09-25",
        lastContactAt: new Date("2026-08-20T12:00:00Z"),
      },
      { stage: "active_care" },
    );
    expect(leadBoardCounts([gone], TODAY).attention).toBe(1);
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

describe("more filters (TOK-66)", () => {
  it("stays closed on a clean URL — the whole of the ship bar", () => {
    expect(moreFiltersOpen(parseLeadQuery({}))).toBe(false);
    expect(secondaryFilterCount(parseLeadQuery({}))).toBe(0);
  });

  it("stays closed for the primary filters, which live outside the panel", () => {
    const query = parseLeadQuery({ tab: "attention", q: "rivera", stage: "fit_confirmed", service: "birth" });
    expect(moreFiltersOpen(query)).toBe(false);
  });

  it("opens itself only when something inside it is already narrowing the board", () => {
    for (const params of [
      { insurance: "commercial" },
      { eddMonth: "2026-10" },
      { owner: "u-1" },
      { source: "referral" },
      { overdue: "1" },
      { unmatched: "1" },
      { unreviewed: "1" },
    ]) {
      expect(moreFiltersOpen(parseLeadQuery(params))).toBe(true);
    }
  });

  it("counts what is on, so the summary cannot claim a narrowing that is not there", () => {
    expect(secondaryFilterCount(parseLeadQuery({ overdue: "1", owner: "u-1" }))).toBe(2);
    expect(secondaryFilterCount(parseLeadQuery({ overdue: "0" }))).toBe(0);
  });
});
