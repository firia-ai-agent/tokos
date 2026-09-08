import { describe, expect, it } from "vitest";
import {
  checklistCards,
  checklistSummary,
  openTaskCount,
  type ChecklistCounts,
} from "./checklist";

const caughtUp: ChecklistCounts = {
  incompleteForms: 0,
  unsignedContracts: 0,
  openInvoices: 0,
  unreadMessages: 0,
  openResources: 0,
  upcomingConsults: 0,
};

const byKey = (counts: ChecklistCounts, doulaName?: string) =>
  Object.fromEntries(
    checklistCards(counts, doulaName).map((card) => [card.key, card] as const),
  );

describe("client Home checklist", () => {
  it("keeps all six cards, in order", () => {
    expect(checklistCards(caughtUp).map((card) => card.key)).toEqual([
      "incompleteForms",
      "unsignedContracts",
      "openInvoices",
      "unreadMessages",
      "openResources",
      "upcomingConsults",
    ]);
  });

  it("labels every count instead of printing a naked number", () => {
    const cards = byKey({
      ...caughtUp,
      incompleteForms: 2,
      unsignedContracts: 1,
      openInvoices: 3,
      unreadMessages: 1,
    });
    expect(cards.incompleteForms.countLabel).toBe("2 open");
    expect(cards.unsignedContracts.countLabel).toBe("1 to sign");
    expect(cards.openInvoices.countLabel).toBe("3 open");
    expect(cards.unreadMessages.countLabel).toBe("1 unread");
  });

  it("says what zero means rather than showing a bare 0", () => {
    const cards = byKey(caughtUp);
    expect(cards.incompleteForms.countLabel).toBe("All done");
    expect(cards.openInvoices.countLabel).toBe("Nothing due");
    expect(cards.unreadMessages.countLabel).toBe("No new messages");
  });

  it("goes coral only for the four chores, and only while they are open", () => {
    const open = byKey({
      incompleteForms: 1,
      unsignedContracts: 1,
      openInvoices: 1,
      unreadMessages: 1,
      openResources: 4,
      upcomingConsults: 2,
    });
    expect(open.incompleteForms.tone).toBe("coral");
    expect(open.unsignedContracts.tone).toBe("coral");
    expect(open.openInvoices.tone).toBe("coral");
    expect(open.unreadMessages.tone).toBe("coral");
    // Resources and consults are context, not homework.
    expect(open.openResources.tone).toBe("ink");
    expect(open.upcomingConsults.tone).toBe("ink");
  });

  it("goes Teal Ink everywhere once the family is caught up", () => {
    for (const card of checklistCards(caughtUp)) {
      expect(card.tone).toBe("ink");
      expect(card.actionable).toBe(false);
    }
  });
});

describe("checklist summary", () => {
  it("counts only the chores, not booked consults or read handouts", () => {
    expect(
      openTaskCount({
        ...caughtUp,
        incompleteForms: 2,
        unreadMessages: 1,
        openResources: 5,
        upcomingConsults: 3,
      }),
    ).toBe(3);
  });

  it("says caught up at zero and singularises one", () => {
    expect(checklistSummary(caughtUp)).toBe("You are all caught up");
    expect(checklistSummary({ ...caughtUp, openInvoices: 1 })).toBe("1 item on your checklist");
    expect(checklistSummary({ ...caughtUp, openInvoices: 2 })).toBe("2 items on your checklist");
  });
});

describe("named card copy (TOK-38)", () => {
  it("names the assigned doula instead of saying 'your doula'", () => {
    const cards = byKey(caughtUp, "Maya Chen");
    expect(cards.unreadMessages.detail).toBe("Write to Maya Chen, and read the replies");
    expect(cards.openResources.detail).toBe("Handouts Maya Chen shared for birth prep");
    expect(cards.upcomingConsults.detail).toBe("Fit visits on Maya Chen's calendar");
    for (const card of checklistCards(caughtUp, "Maya Chen")) {
      expect(card.detail.toLowerCase()).not.toContain("your doula");
    }
  });

  it("falls back to the practice name when nobody is assigned yet", () => {
    const cards = byKey(caughtUp, "NOVA Birth Prep");
    expect(cards.unreadMessages.detail).toBe("Write to NOVA Birth Prep, and read the replies");
  });
});
