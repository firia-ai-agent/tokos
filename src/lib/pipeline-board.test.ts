import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  NEEDS_ACTION_LEGEND,
  boardTeamLine,
  boardTotals,
  emptyColumnHint,
  familyRecordHref,
  groupLeadsByStage,
  pipelineBoardCard,
  pipelineBoardColumns,
  stageCounts,
  stageMoveOptions,
  type BoardRowLike,
} from "./pipeline-board";
import { PIPELINE_STAGES, STAGE_LABELS, type PipelineStageName } from "./pipeline";

const TODAY = new Date("2026-09-10T12:00:00Z");

function row(
  over: { id: string; displayName: string } & Partial<BoardRowLike["client"]>,
  rest: Partial<BoardRowLike> = {},
): BoardRowLike {
  return {
    client: {
      email: `${over.id}@example.invalid`,
      phone: null,
      serviceType: null,
      edd: null,
      source: "website",
      insurance: "unknown",
      followUpDueOn: null,
      // Spoken to this week, reviewed, matched: a hand-built row is "clean" only if it
      // clears the no-contact rule too.
      lastContactAt: new Date("2026-09-08T12:00:00Z"),
      reviewed: true,
      ownerUserId: null,
      ...over,
    },
    stage: "new_lead" as PipelineStageName,
    stageEnteredAt: new Date("2026-09-08T12:00:00Z"),
    primaryDoulaUserId: "doula-1",
    primaryDoulaName: "Sheliya M.",
    lastNoteAt: new Date("2026-09-09T12:00:00Z"),
    ...rest,
  };
}

describe("grouping — nothing is hidden and no stage is missing", () => {
  it("gives every canonical stage a column, occupied or not", () => {
    const groups = groupLeadsByStage([row({ id: "a", displayName: "Amara" })]);
    expect([...groups.keys()]).toEqual([...PIPELINE_STAGES]);
  });

  it("keeps every row: the cards on the board add up to the rows handed in", () => {
    const rows = PIPELINE_STAGES.flatMap((stage, index) =>
      Array.from({ length: index + 1 }, (_, n) =>
        row({ id: `${stage}-${n}`, displayName: `${stage} ${n}` }, { stage }),
      ),
    );
    const columns = pipelineBoardColumns(rows, { persona: "agency", now: TODAY });
    const cards = columns.reduce((sum, column) => sum + column.cards.length, 0);
    expect(cards).toBe(rows.length);
  });

  it("counts the whole group, never a truncated view of it", () => {
    // The reference mock ends this column at two cards and writes "+12 more". Fourteen
    // families in active care means a column of fourteen and a header that says 14.
    const rows = Array.from({ length: 14 }, (_, n) =>
      row({ id: `care-${n}`, displayName: `Family ${n}` }, { stage: "active_care" }),
    );
    const columns = pipelineBoardColumns(rows, { persona: "agency", now: TODAY });
    const care = columns.find((column) => column.stage === "active_care");
    expect(care?.count).toBe(14);
    expect(care?.cards).toHaveLength(14);
    expect(care?.count).toBe(care?.cards.length);
  });

  it("preserves the incoming order inside a column, so the board keeps the list's sort", () => {
    const rows = [
      row({ id: "1", displayName: "First" }, { stage: "outreach_sent" }),
      row({ id: "2", displayName: "Second" }, { stage: "outreach_sent" }),
      row({ id: "3", displayName: "Third" }, { stage: "outreach_sent" }),
    ];
    const groups = groupLeadsByStage(rows);
    expect(groups.get("outreach_sent")?.map((r) => r.client.id)).toEqual(["1", "2", "3"]);
  });

  it("keeps a row whose stage is outside the canonical set rather than dropping her", () => {
    const stray = row({ id: "stray", displayName: "Stray" }, {
      stage: "somewhere_else" as PipelineStageName,
    });
    const groups = groupLeadsByStage([stray]);
    expect(groups.get("somewhere_else" as PipelineStageName)).toHaveLength(1);
  });

  it("counts per stage off the full groups", () => {
    const counts = stageCounts([
      row({ id: "a", displayName: "A" }, { stage: "new_lead" }),
      row({ id: "b", displayName: "B" }, { stage: "new_lead" }),
      row({ id: "c", displayName: "C" }, { stage: "closed" }),
    ]);
    expect(counts.new_lead).toBe(2);
    expect(counts.closed).toBe(1);
    expect(counts.postpartum).toBe(0);
  });
});

describe("move options — the board only offers moves the server would accept", () => {
  it("never offers the stage the family is already on", () => {
    const options = stageMoveOptions("agency", "new_lead");
    expect(options.some((option) => option.stage === "new_lead")).toBe(false);
  });

  it("withholds Consult scheduled until a consult date is on the record", () => {
    const without = stageMoveOptions("agency", "new_lead");
    expect(without.some((option) => option.stage === "consult_scheduled")).toBe(false);

    const withDate = stageMoveOptions("agency", "new_lead", {
      fitConfirmed: false,
      paymentCleared: false,
      agreementSigned: false,
      consultDateSet: true,
    });
    expect(withDate.some((option) => option.stage === "consult_scheduled")).toBe(true);
  });

  it("withholds Agreement signed until the fit is confirmed", () => {
    const early = stageMoveOptions("agency", "consult_done", {
      fitConfirmed: false,
      paymentCleared: false,
      agreementSigned: false,
    });
    expect(early.some((option) => option.stage === "agreement_signed")).toBe(false);

    const matched = stageMoveOptions("agency", "fit_confirmed", {
      fitConfirmed: true,
      paymentCleared: false,
      agreementSigned: false,
    });
    expect(matched.some((option) => option.stage === "agreement_signed")).toBe(true);
  });

  it("withholds Complete until the agreement is signed and the payment has cleared", () => {
    const signedOnly = stageMoveOptions("agency", "agreement_signed", {
      fitConfirmed: true,
      paymentCleared: false,
      agreementSigned: true,
    });
    expect(signedOnly.some((option) => option.stage === "complete")).toBe(false);

    const both = stageMoveOptions("agency", "agreement_signed", {
      fitConfirmed: true,
      paymentCleared: true,
      agreementSigned: true,
    });
    expect(both.some((option) => option.stage === "complete")).toBe(true);
  });

  it("marks the backward moves, which is what makes the UI ask first", () => {
    const options = stageMoveOptions("agency", "fit_confirmed", {
      fitConfirmed: true,
      paymentCleared: false,
      agreementSigned: false,
    });
    const back = options.find((option) => option.stage === "new_lead");
    const forward = options.find((option) => option.stage === "agreement_signed");
    expect(back?.backward).toBe(true);
    expect(forward?.backward).toBe(false);
  });

  it("words the options for whoever is reading — no stage codes, no agency voice for a doula", () => {
    const agency = stageMoveOptions("agency", "outreach_sent");
    const doula = stageMoveOptions("doula", "outreach_sent");
    expect(agency.find((option) => option.stage === "new_lead")?.label).toBe("New lead");
    expect(doula.find((option) => option.stage === "new_lead")?.label).toBe("New family");
    for (const option of [...agency, ...doula]) {
      expect(option.label).not.toBe(option.stage);
    }
  });

  it("still offers somewhere to go from the last stage, so nothing is a dead end", () => {
    expect(stageMoveOptions("agency", "closed").length).toBeGreaterThan(0);
  });
});

describe("cards — the density bar", () => {
  const dense = row(
    {
      id: "dense",
      displayName: "Jordan Bellamy",
      serviceType: "postpartum",
      edd: "2026-10-13",
      source: "website",
      lastContactAt: new Date("2026-09-09T12:00:00Z"),
    },
    { stage: "new_lead", ledger: { outstandingCents: 240000 } },
  );

  it("carries service, EDD with gestation, source and recency, and one money line", () => {
    const card = pipelineBoardCard(dense, { persona: "agency", now: TODAY });
    expect(card.facts[0]).toBe("Postpartum");
    expect(card.facts[1]).toContain("EDD");
    expect(card.facts[1]).toMatch(/\d+w\d+d/);
    expect(card.facts[2]).toContain("Website");
    expect(card.money).toEqual({ label: "$2,400 open", tone: "coral" });
  });

  it("drives the terracotta edge off the needs-attention rules, not off a second idea of urgent", () => {
    const overdue = row(
      { id: "late", displayName: "Late", followUpDueOn: "2026-09-01" },
      { stage: "outreach_sent" },
    );
    // A follow-up is planned, so not even the soft intake nudge has anything to say.
    const clean = row(
      { id: "clean", displayName: "Clean", followUpDueOn: "2026-09-20" },
      { stage: "outreach_sent" },
    );
    expect(pipelineBoardCard(overdue, { persona: "agency", now: TODAY }).needsAction).toBe(true);
    expect(pipelineBoardCard(overdue, { persona: "agency", now: TODAY }).attention).toContain(
      "Follow-up overdue",
    );
    expect(pipelineBoardCard(clean, { persona: "agency", now: TODAY }).needsAction).toBe(false);
    expect(pipelineBoardCard(clean, { persona: "agency", now: TODAY }).attention).toBeNull();
  });

  it("deep-links to the family record", () => {
    const card = pipelineBoardCard(dense, { persona: "agency", now: TODAY });
    expect(card.href).toBe(familyRecordHref("dense"));
    expect(card.href).toBe("/doula/clients/dense");
  });

  it("names who is on her for an agency and says so when nobody is", () => {
    expect(boardTeamLine("agency", "Sheliya M.")).toBe("w/ Sheliya M.");
    expect(boardTeamLine("agency", null)).toBe("No primary doula");
    expect(boardTeamLine("agency", "   ")).toBe("No primary doula");
  });

  it("does not print a doula her own name on every card", () => {
    expect(boardTeamLine("doula", "Priya R.")).toBeNull();
    expect(pipelineBoardCard(dense, { persona: "doula", now: TODAY }).team).toBeNull();
  });
});

describe("columns — labels and quiet stages", () => {
  it("takes headings from the shared label helpers, worded for the persona", () => {
    const agency = pipelineBoardColumns([], { persona: "agency", now: TODAY });
    const doula = pipelineBoardColumns([], { persona: "doula", now: TODAY });
    expect(agency[0]?.label).toBe(STAGE_LABELS.new_lead);
    expect(doula[0]?.label).toBe("New family");
    for (const column of [...agency, ...doula]) {
      expect(column.label).not.toBe(column.stage);
    }
  });

  it("keeps the empty columns, because an empty column is where a family can be moved", () => {
    const columns = pipelineBoardColumns([row({ id: "a", displayName: "A" })], {
      persona: "agency",
      now: TODAY,
    });
    expect(columns).toHaveLength(PIPELINE_STAGES.length);
    expect(columns.filter((column) => column.count === 0)).toHaveLength(
      PIPELINE_STAGES.length - 1,
    );
  });

  it("says what a quiet stage is for, in the reader's own voice", () => {
    expect(emptyColumnHint("agency", "outreach_sent")).toBe(
      "First contact is out; waiting on a reply.",
    );
    expect(emptyColumnHint("doula", "outreach_sent")).toBe("Nobody at this step right now.");
  });

  it("totals the board off the columns, so the header line cannot disagree with them", () => {
    const columns = pipelineBoardColumns(
      [
        row({ id: "a", displayName: "A", followUpDueOn: "2026-09-01" }, { stage: "new_lead" }),
        row({ id: "b", displayName: "B" }, { stage: "active_care" }),
        row({ id: "c", displayName: "C" }, { stage: "active_care" }),
      ],
      { persona: "agency", now: TODAY },
    );
    expect(boardTotals(columns)).toEqual({ families: 3, needsAction: 1 });
  });

  it("keeps the legend to one line", () => {
    expect(NEEDS_ACTION_LEGEND).toBe("Terracotta edge = needs action today");
    expect(NEEDS_ACTION_LEGEND).not.toMatch(/more/i);
  });
});

/**
 * The ship bar, read off the sources.
 *
 * The two failures TOK-72 exists to end are both greppable: a column that hides cards
 * behind "+N more", and colour typed as a hex literal instead of a Faith token. A unit
 * test cannot see a screen, but it can keep either from coming back unnoticed.
 */
describe("no truncation and no raw colour in the board sources", () => {
  const SOURCES = [
    ["src", "components", "brand", "pipeline-board.tsx"],
    ["src", "app", "(doula)", "doula", "clients", "page.tsx"],
    ["src", "app", "(doula)", "doula", "clients", "lead-queue.tsx"],
    ["src", "lib", "pipeline-board.ts"],
  ];

  /** Comments are where we explain what is banned; the code is what is checked. */
  function code(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  }

  for (const parts of SOURCES) {
    const label = parts.slice(1).join("/");

    it(`shows every card and speaks in tokens: ${label}`, () => {
      const source = code(readFileSync(join(process.cwd(), ...parts), "utf8"));
      // "+12 more in active care" and every relative of it.
      expect(source).not.toMatch(/\+\s*\{?[\w.]*\}?\s*more/i);
      expect(source).not.toMatch(/more in (active|the)/i);
      // A column that slices is a column that lies about its own count.
      expect(source).not.toMatch(/cards\.slice\(|\.slice\(0,\s*\d/);
      // Faith tokens only — no hex, no cold-blue kanban chrome.
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(source).not.toMatch(
        /\b(bg|text|border|ring)-(blue|indigo|violet|purple|slate|gray|grey)-\d/,
      );
    });
  }
});
