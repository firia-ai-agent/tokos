import { describe, expect, it } from "vitest";
import {
  NEEDS_ATTENTION_LABELS,
  NEEDS_ATTENTION_REASONS,
  daysSinceContact,
  needsAttention,
  needsAttentionReasons,
  needsAttentionRows,
  reasonSummary,
  type NeedsAttentionInput,
} from "./needs-attention";

const TODAY = new Date("2026-09-10T12:00:00Z");

/** A record with nothing wrong with it. Each test breaks exactly one thing. */
const clean: NeedsAttentionInput = {
  clientId: "c1",
  name: "Amara Alderman",
  stage: "outreach_sent",
  followUpDueOn: "2026-09-20",
  reviewed: true,
  hasPrimaryDoula: true,
  stageEnteredAt: new Date("2026-09-01T12:00:00Z"),
  lastNoteAt: new Date("2026-09-02T12:00:00Z"),
};

const keys = (input: NeedsAttentionInput) =>
  needsAttentionReasons(input, TODAY).map((reason) => reason.key);

describe("a clean record is quiet", () => {
  it("raises nothing", () => {
    expect(keys(clean)).toEqual([]);
    expect(needsAttention(clean, TODAY)).toBe(false);
  });

  it("labels every declared reason", () => {
    for (const key of NEEDS_ATTENTION_REASONS) {
      expect(NEEDS_ATTENTION_LABELS[key].trim()).toBeTruthy();
    }
  });
});

describe("overdue follow-up", () => {
  it("fires on a date in the past", () => {
    expect(keys({ ...clean, followUpDueOn: "2026-09-06" })).toEqual(["follow_up_overdue"]);
  });

  it("does not fire on today or on a future date", () => {
    expect(keys({ ...clean, followUpDueOn: "2026-09-10" })).toEqual([]);
    expect(keys({ ...clean, followUpDueOn: "2026-09-11" })).toEqual([]);
  });

  it("does not fire when no follow-up is set — that is unplanned, not urgent", () => {
    expect(keys({ ...clean, followUpDueOn: null })).toEqual([]);
  });
});

describe("unreviewed", () => {
  it("fires until the founder has checked the record", () => {
    expect(keys({ ...clean, reviewed: false })).toEqual(["unreviewed"]);
    expect(keys({ ...clean, reviewed: null })).toEqual(["unreviewed"]);
  });
});

describe("unmatched", () => {
  it("fires when nobody is primary", () => {
    expect(keys({ ...clean, hasPrimaryDoula: false })).toEqual(["unmatched"]);
  });
});

describe("consult done with no note", () => {
  it("fires when nothing has been written since entering the stage", () => {
    expect(
      keys({
        ...clean,
        stage: "consult_done",
        stageEnteredAt: new Date("2026-09-08T12:00:00Z"),
        lastNoteAt: new Date("2026-09-02T12:00:00Z"),
      }),
    ).toEqual(["consult_note_missing"]);
  });

  it("fires when there is no note at all", () => {
    expect(keys({ ...clean, stage: "consult_done", lastNoteAt: null })).toEqual([
      "consult_note_missing",
    ]);
  });

  it("clears once a note lands after the stage was entered", () => {
    expect(
      keys({
        ...clean,
        stage: "consult_done",
        stageEnteredAt: new Date("2026-09-08T12:00:00Z"),
        lastNoteAt: new Date("2026-09-09T12:00:00Z"),
      }),
    ).toEqual([]);
  });

  it("only applies on consult_done", () => {
    expect(keys({ ...clean, stage: "fit_confirmed", lastNoteAt: null })).toEqual([]);
  });
});

describe("closed records are exempt", () => {
  it("stays silent even with every other rule broken", () => {
    expect(
      keys({
        ...clean,
        stage: "closed",
        followUpDueOn: "2026-01-01",
        reviewed: false,
        hasPrimaryDoula: false,
      }),
    ).toEqual([]);
  });
});

describe("the queue", () => {
  const rows: NeedsAttentionInput[] = [
    { ...clean, clientId: "quiet", name: "Quiet Family" },
    { ...clean, clientId: "one", name: "Zoe Unreviewed", reviewed: false },
    {
      ...clean,
      clientId: "many",
      name: "Avery Overdue",
      followUpDueOn: "2026-09-01",
      reviewed: false,
      hasPrimaryDoula: false,
    },
  ];

  it("names each family once, with all of her reasons", () => {
    const queue = needsAttentionRows(rows, TODAY);
    expect(queue.map((row) => row.clientId)).toEqual(["many", "one"]);
    expect(queue[0].reasons.map((r) => r.key)).toEqual([
      "follow_up_overdue",
      "unmatched",
      "unreviewed",
    ]);
  });

  it("puts the worst first", () => {
    const queue = needsAttentionRows(rows, TODAY);
    expect(queue[0].score).toBeGreaterThan(queue[1].score);
  });

  it("renders a short reason list and a link to the family", () => {
    const queue = needsAttentionRows(rows, TODAY);
    expect(reasonSummary(queue[0])).toBe("Follow-up overdue · No primary doula · Not reviewed");
    expect(queue[0].href).toBe("/doula/clients/many");
    expect(queue[0].stageLabel).toBe("Outreach sent");
  });

  it("drops clean families entirely", () => {
    expect(needsAttentionRows(rows, TODAY).map((row) => row.clientId)).not.toContain("quiet");
  });
});

describe("daysSinceContact", () => {
  it("counts calendar days, or null when nothing is logged", () => {
    expect(daysSinceContact(new Date("2026-09-03T12:00:00Z"), TODAY)).toBe(7);
    expect(daysSinceContact(null, TODAY)).toBeNull();
  });
});
