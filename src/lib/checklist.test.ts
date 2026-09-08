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
    expect(checklistSummary(caughtUp)).toBe("Nothing waiting on you today");
    expect(checklistSummary({ ...caughtUp, openInvoices: 1 })).toBe("1 thing waiting for you");
    expect(checklistSummary({ ...caughtUp, openInvoices: 2 })).toBe("2 things waiting for you");
  });

  it("keeps office vocabulary out of the greeting line (TOK-35)", () => {
    for (const open of [0, 1, 6]) {
      const line = checklistSummary({ ...caughtUp, openInvoices: open }).toLowerCase();
      expect(line).not.toContain("checklist");
      expect(line).not.toContain("item");
      expect(line).not.toContain("to do");
    }
  });
});

describe("named card copy (TOK-38)", () => {
  it("names the assigned doula instead of saying 'your doula'", () => {
    const cards = byKey(caughtUp, "Maya Chen");
    expect(cards.unreadMessages.detail).toBe("Write to Maya Chen, and read the replies");
    expect(cards.openResources.detail).toBe("Handouts Maya Chen shared for birth prep");
    expect(cards.upcomingConsults.detail).toBe("Time booked with Maya Chen");
    for (const card of checklistCards(caughtUp, "Maya Chen")) {
      expect(card.detail.toLowerCase()).not.toContain("your doula");
    }
  });

  it("falls back to the practice name when nobody is assigned yet", () => {
    const cards = byKey(caughtUp, "NOVA Birth Prep");
    expect(cards.unreadMessages.detail).toBe("Write to NOVA Birth Prep, and read the replies");
  });
});

describe("locked Resources card (TOK-39 E2)", () => {
  const locked = (counts = { ...caughtUp, openResources: 3 }) =>
    Object.fromEntries(
      checklistCards(counts, "Maya Chen", { resourcesLocked: true }).map(
        (card) => [card.key, card] as const,
      ),
    );

  it("shows no number, so a locked shelf does not tease its contents", () => {
    expect(locked().openResources.count).toBe(0);
    expect(locked().openResources.countLabel).toBe("Opens after signing");
  });

  it("says when it opens, naming the doula who shares them", () => {
    expect(locked().openResources.detail).toBe(
      "Handouts Maya Chen shares once your agreement is signed and paid",
    );
    expect(locked().openResources.locked).toBe(true);
  });

  it("is never a chore — a family cannot do anything about it from here", () => {
    expect(locked().openResources.actionable).toBe(false);
    expect(locked().openResources.tone).toBe("ink");
  });

  it("touches no other card", () => {
    const cards = locked({ ...caughtUp, openResources: 3, incompleteForms: 2 });
    expect(cards.incompleteForms.countLabel).toBe("2 open");
    expect(cards.openResources.href).toBe("/portal/resources");
    for (const key of Object.keys(cards)) {
      if (key !== "openResources") expect(cards[key].locked).toBeUndefined();
    }
  });

  it("is the ordinary card once the gate opens", () => {
    const cards = byKey({ ...caughtUp, openResources: 3 }, "Maya Chen");
    expect(cards.openResources.countLabel).toBe("3 new");
    expect(cards.openResources.locked).toBeUndefined();
  });
});
