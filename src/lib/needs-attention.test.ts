import { describe, expect, it } from "vitest";
import {
  NEEDS_ATTENTION_LABELS,
  NEEDS_ATTENTION_NO_CONTACT_DAYS,
  NEEDS_ATTENTION_REASONS,
  daysSinceContact,
  reasonActionHref,
  reasonActionLabel,
  reasonLabel,
  needsAttention,
  needsAttentionReasons,
  needsAttentionRows,
  reasonSummary,
  type NeedsAttentionInput,
} from "./needs-attention";

const TODAY = new Date("2026-09-10T12:00:00Z");

/**
 * A record with nothing wrong with it. Each test breaks exactly one thing.
 *
 * "Nothing wrong" now includes having been spoken to this week (TOK-58): a live record
 * nobody has contacted in seven days is a finding, so a clean fixture has to have a
 * recent contact logged the same way it has to have a follow-up date.
 */
const clean: NeedsAttentionInput = {
  clientId: "c1",
  name: "Amara Alderman",
  stage: "outreach_sent",
  followUpDueOn: "2026-09-20",
  reviewed: true,
  hasPrimaryDoula: true,
  stageEnteredAt: new Date("2026-09-01T12:00:00Z"),
  lastNoteAt: new Date("2026-09-02T12:00:00Z"),
  lastContactAt: new Date("2026-09-08T12:00:00Z"),
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
  it("has an action and a real staff surface for each key", () => {
    for (const key of NEEDS_ATTENTION_REASONS) {
      expect(reasonActionLabel(key).trim()).toBeTruthy();
      expect(reasonActionHref("c1", key)).toMatch(
        /^\/doula\/(clients\/c1#[a-z-]+|messages\?client=c1)$/,
      );
    }
  });

  /**
   * TOK-64: an unread family is the one reason whose fix is a conversation, not a section
   * of a CRM record. The bell and the review board both take this href, so it is the
   * single place that decides "Read the message" opens *her* thread.
   */
  it("opens that family's own thread for an unread message", () => {
    expect(reasonActionHref("jordan", "unread_message")).toBe("/doula/messages?client=jordan");
  });

  it("still sends every other reason to a section of her record", () => {
    for (const key of NEEDS_ATTENTION_REASONS) {
      if (key === "unread_message") continue;
      expect(reasonActionHref("c1", key)).toMatch(/^\/doula\/clients\/c1#[a-z-]+$/);
    }
  });

  it("does not just repeat the label back", () => {
    for (const key of NEEDS_ATTENTION_REASONS) {
      expect(reasonActionLabel(key)).not.toBe(NEEDS_ATTENTION_LABELS[key]);
    }
  });
});

/* ------------------------------------------------------------------- TOK-58 */

/** Anchored off the constant, not a literal, so raising the policy re-aims the test. */
const daysAgo = (n: number) => new Date(TODAY.getTime() - n * 24 * 60 * 60 * 1000);

describe("no word in N days", () => {
  it("fires on the Nth quiet day and not the day before", () => {
    const boundary = { ...clean, lastContactAt: daysAgo(NEEDS_ATTENTION_NO_CONTACT_DAYS - 1) };
    expect(keys(boundary)).toEqual([]);
    expect(keys({ ...clean, lastContactAt: daysAgo(NEEDS_ATTENTION_NO_CONTACT_DAYS) })).toEqual([
      "no_contact",
    ]);
  });

  it("clears the moment a contact is logged", () => {
    const quiet = { ...clean, lastContactAt: daysAgo(30) };
    expect(keys(quiet)).toEqual(["no_contact"]);
    expect(keys({ ...quiet, lastContactAt: TODAY })).toEqual([]);
  });

  it("measures an unlogged record from when it entered its stage", () => {
    // Nothing logged and sat in the same stage for a fortnight is the silence the rule is
    // for; nothing logged on a record that arrived yesterday is just a new record.
    expect(keys({ ...clean, lastContactAt: null })).toEqual(["no_contact"]);
    expect(
      keys({ ...clean, lastContactAt: null, stageEnteredAt: daysAgo(1) }),
    ).toEqual([]);
    expect(keys({ ...clean, lastContactAt: null, stageEnteredAt: null })).toEqual([]);
  });

  it("says how long the silence is, and reads as urgent", () => {
    const [reason] = needsAttentionReasons({ ...clean, lastContactAt: daysAgo(9) }, TODAY);
    expect(reason.label).toBe(`No word in ${NEEDS_ATTENTION_NO_CONTACT_DAYS} days`);
    expect(reason.detail).toBe("9 days quiet");
    expect(reason.urgent).toBe(true);
  });

  it("says so plainly when there is nothing logged to count from", () => {
    const [reason] = needsAttentionReasons({ ...clean, lastContactAt: null }, TODAY);
    expect(reason.detail).toBe("No contact logged");
  });

  it("exempts a closed record like every other rule", () => {
    expect(keys({ ...clean, stage: "closed", lastContactAt: daysAgo(90) })).toEqual([]);
  });
});

describe("forms still open", () => {
  it("fires on a count or a flag", () => {
    expect(keys({ ...clean, incompleteFormCount: 2 })).toEqual(["forms_incomplete"]);
    expect(keys({ ...clean, hasIncompleteForms: true })).toEqual(["forms_incomplete"]);
  });

  it("clears once the family has finished them", () => {
    expect(keys({ ...clean, incompleteFormCount: 0, hasIncompleteForms: false })).toEqual([]);
  });

  it("counts them, and stays a chore rather than an alarm", () => {
    const [reason] = needsAttentionReasons({ ...clean, incompleteFormCount: 2 }, TODAY);
    expect(reason.label).toBe("Forms still open");
    expect(reason.detail).toBe("2 forms");
    expect(reason.urgent).toBe(false);
    const [one] = needsAttentionReasons({ ...clean, incompleteFormCount: 1 }, TODAY);
    expect(one.detail).toBe("1 form");
  });
});

describe("missed visit", () => {
  it("fires on a count or a flag", () => {
    expect(keys({ ...clean, missedVisitCount: 1 })).toEqual(["missed_visit"]);
    expect(keys({ ...clean, hasMissedVisit: true })).toEqual(["missed_visit"]);
  });

  it("clears when every visit is resolved", () => {
    expect(keys({ ...clean, missedVisitCount: 0, hasMissedVisit: false })).toEqual([]);
  });

  it("is a missed date — urgent, and under the money", () => {
    const [reason] = needsAttentionReasons({ ...clean, missedVisitCount: 2 }, TODAY);
    expect(reason.label).toBe("Missed visit");
    expect(reason.detail).toBe("2 visits");
    expect(reason.urgent).toBe(true);
    const [invoice] = needsAttentionReasons({ ...clean, openInvoiceCents: 90000 }, TODAY);
    expect(invoice.weight).toBeGreaterThan(reason.weight);
  });
});

describe("unread message", () => {
  it("names the family who wrote it", () => {
    const [reason] = needsAttentionReasons({ ...clean, unreadInboundCount: 1 }, TODAY);
    expect(reason.key).toBe("unread_message");
    expect(reason.label).toBe("Unread from Amara Alderman");
    expect(reason.label).toContain(clean.name);
    expect(reason.urgent).toBe(true);
  });

  it("clears once somebody opens it", () => {
    expect(keys({ ...clean, unreadInboundCount: 0 })).toEqual([]);
  });

  it("counts the backlog", () => {
    const [reason] = needsAttentionReasons({ ...clean, unreadInboundCount: 3 }, TODAY);
    expect(reason.detail).toBe("3 messages");
  });

  it("falls back to the plain label when there is no name to use", () => {
    expect(reasonLabel("unread_message")).toBe("Unread message");
    expect(reasonLabel("unread_message", { name: "  " })).toBe("Unread message");
    expect(reasonLabel("open_invoice", { name: "Maya Chen" })).toBe("Open invoice");
  });
});

/**
 * TOK-53's model has to survive four new rules: a family with old findings and new ones
 * is still one row, named once, worst first.
 */
describe("one row per family holds with the TOK-58 rules", () => {
  const maya: NeedsAttentionInput = {
    ...clean,
    clientId: "maya",
    name: "Maya Chen",
    stage: "active_care",
    reviewed: false,
    openInvoiceCents: 90000,
    lastContactAt: daysAgo(12),
    missedVisitCount: 1,
    unreadInboundCount: 2,
    incompleteFormCount: 3,
  };

  it("collapses six findings into one Maya, sorted by weight", () => {
    const queue = needsAttentionRows([maya, { ...clean, clientId: "quiet", name: "Quiet" }], TODAY);
    expect(queue).toHaveLength(1);
    expect(queue[0].name).toBe("Maya Chen");
    expect(queue[0].reasons.map((r) => r.key)).toEqual([
      "open_invoice",
      "missed_visit",
      "no_contact",
      "unread_message",
      "forms_incomplete",
      "unreviewed",
    ]);
    const weights = queue[0].reasons.map((r) => r.weight);
    expect([...weights].sort((a, b) => b - a)).toEqual(weights);
  });

  it("prints the name once and the reasons as one short list", () => {
    const [row] = needsAttentionRows([maya], TODAY);
    expect(reasonSummary(row)).toBe(
      `Open invoice · Missed visit · No word in ${NEEDS_ATTENTION_NO_CONTACT_DAYS} days · ` +
        "Unread from Maya Chen · Forms still open · Not reviewed",
    );
    expect(reasonSummary(row).match(/Maya Chen/g)).toHaveLength(1);
    expect(row.href).toBe("/doula/clients/maya");
    expect(row.score).toBe(row.reasons.reduce((sum, r) => sum + r.weight, 0));
  });

  it("keeps the softest nudge out of a row that already says plenty", () => {
    expect(
      needsAttentionReasons({ ...maya, stage: "outreach_sent", followUpDueOn: null }, TODAY)
        .map((r) => r.key),
    ).not.toContain("intake_nudge");
  });
});
