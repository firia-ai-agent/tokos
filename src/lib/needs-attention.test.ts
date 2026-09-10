import { describe, expect, it } from "vitest";
import {
  NEEDS_ATTENTION_LABELS,
  NEEDS_ATTENTION_REASONS,
  daysSinceContact,
  reasonActionHref,
  reasonActionLabel,
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
    // Unplanned is the soft nudge's job now (TOK-53), never the overdue rule's.
    expect(keys({ ...clean, followUpDueOn: null })).toEqual(["intake_nudge"]);
    expect(keys({ ...clean, followUpDueOn: null, stage: "active_care" })).toEqual([]);
  });
});

/* ------------------------------------------------------------------- TOK-53 */

describe("agreement waiting", () => {
  it("fires on an unsigned agreement, by flag or by amount", () => {
    expect(keys({ ...clean, hasUnsignedAgreement: true })).toEqual(["agreement_waiting"]);
    expect(keys({ ...clean, unsignedAgreementCents: 280000 })).toEqual(["agreement_waiting"]);
  });

  it("clears once it is signed — the caller stops sending the fact", () => {
    expect(
      keys({ ...clean, hasUnsignedAgreement: false, unsignedAgreementCents: 0 }),
    ).toEqual([]);
  });

  it("carries the amount as detail, so the row can say what is at stake", () => {
    const [reason] = needsAttentionReasons({ ...clean, unsignedAgreementCents: 280000 }, TODAY);
    expect(reason.detail).toBe("$2,800.00 · not signed");
    expect(reason.urgent).toBe(true);
  });
});

describe("open invoice", () => {
  it("fires while an invoice sits open", () => {
    expect(keys({ ...clean, hasOpenInvoice: true })).toEqual(["open_invoice"]);
    expect(keys({ ...clean, openInvoiceCents: 90000 })).toEqual(["open_invoice"]);
  });

  it("clears when nothing is open — paid, draft and void are all silence", () => {
    expect(keys({ ...clean, hasOpenInvoice: false, openInvoiceCents: 0 })).toEqual([]);
  });

  it("carries the amount as detail", () => {
    const [reason] = needsAttentionReasons({ ...clean, openInvoiceCents: 90000 }, TODAY);
    expect(reason.detail).toBe("$900.00");
  });
});

describe("the intake nudge", () => {
  const unplanned: NeedsAttentionInput = { ...clean, followUpDueOn: null };

  it("fires on an open funnel stage with no next step planned", () => {
    expect(keys(unplanned)).toEqual(["intake_nudge"]);
    expect(needsAttentionReasons(unplanned, TODAY)[0].detail).toBe("Outreach sent");
  });

  it("stays quiet once a follow-up is on the record", () => {
    expect(keys({ ...unplanned, followUpDueOn: "2026-09-25" })).toEqual([]);
  });

  it("stays quiet past the funnel — care is not intake", () => {
    expect(keys({ ...unplanned, stage: "active_care" })).toEqual([]);
    expect(keys({ ...unplanned, stage: "complete" })).toEqual([]);
  });

  it("never doubles up: a sharper reason absorbs it", () => {
    // This is the Jordan × N fix at the rule level. Money is already shouting about her,
    // so "keep intake moving" underneath it is the same finding wearing a second row.
    expect(keys({ ...unplanned, hasOpenInvoice: true })).toEqual(["open_invoice"]);
    expect(keys({ ...unplanned, reviewed: false })).toEqual(["unreviewed"]);
  });

  it("is the softest thing in the queue", () => {
    const [nudge] = needsAttentionReasons(unplanned, TODAY);
    expect(nudge.urgent).toBe(false);
    const [worst] = needsAttentionReasons({ ...clean, hasUnsignedAgreement: true }, TODAY);
    expect(worst.weight).toBeGreaterThan(nudge.weight);
  });
});

describe("commercial urgency outranks housekeeping", () => {
  it("leads the summary with the agreement, then the invoice", () => {
    const [row] = needsAttentionRows(
      [
        {
          ...clean,
          clientId: "jordan",
          name: "Jordan Rivera",
          stage: "fit_confirmed",
          reviewed: false,
          unsignedAgreementCents: 280000,
          openInvoiceCents: 90000,
        },
      ],
      TODAY,
    );
    expect(row.reasons.map((r) => r.key)).toEqual([
      "agreement_waiting",
      "open_invoice",
      "unreviewed",
    ]);
  });
});

/**
 * The whole of TOK-53, stated once.
 *
 * The bell used to list an alert at a time, so the founder's own worked example — an
 * unsigned agreement, an open invoice and a funnel stage on one family — took three of
 * four slots under the same name.
 */
describe("one row per family, not one row per alert", () => {
  const jordan: NeedsAttentionInput = {
    ...clean,
    clientId: "jordan",
    name: "Jordan Rivera",
    stage: "fit_confirmed",
    followUpDueOn: null,
    unsignedAgreementCents: 280000,
    openInvoiceCents: 90000,
  };
  const avery: NeedsAttentionInput = {
    ...clean,
    clientId: "avery",
    name: "Avery Kim",
    stage: "outreach_sent",
    followUpDueOn: null,
  };

  it("collapses three findings into one Jordan", () => {
    const queue = needsAttentionRows([jordan, avery], TODAY);
    expect(queue.map((row) => row.clientId)).toEqual(["jordan", "avery"]);
    expect(queue.filter((row) => row.name === "Jordan Rivera")).toHaveLength(1);
  });

  it("keeps every finding, under the one name", () => {
    const [row] = needsAttentionRows([jordan, avery], TODAY);
    expect(row.reasons.map((r) => r.key)).toEqual(["agreement_waiting", "open_invoice"]);
    expect(reasonSummary(row)).toBe("Agreement waiting · Open invoice");
    expect(row.href).toBe("/doula/clients/jordan");
  });

  it("still gives the quieter family her own row", () => {
    const [, row] = needsAttentionRows([jordan, avery], TODAY);
    expect(reasonSummary(row)).toBe("Keep intake moving");
    expect(row.href).toBe("/doula/clients/avery");
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

/** TOK-52: a rule that cannot be acted on is a rule that gets ignored. */
describe("every reason knows how it is fixed", () => {
  it("has an action and a section of the record for each key", () => {
    for (const key of NEEDS_ATTENTION_REASONS) {
      expect(reasonActionLabel(key).trim()).toBeTruthy();
      expect(reasonActionHref("c1", key)).toMatch(/^\/doula\/clients\/c1#[a-z-]+$/);
    }
  });

  it("does not just repeat the label back", () => {
    for (const key of NEEDS_ATTENTION_REASONS) {
      expect(reasonActionLabel(key)).not.toBe(NEEDS_ATTENTION_LABELS[key]);
    }
  });
});
