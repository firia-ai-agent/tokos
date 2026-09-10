import { describe, expect, it } from "vitest";
import {
  REVIEW_BOARD_HREF,
  WAITING_BOARD_HREF,
  familySurfaceLinks,
  reviewBoard,
  reviewQueueLink,
  reviewQueueSummary,
  reviewTaskCount,
  waitingBoard,
  waitingQueueLink,
} from "./home-queues";
import { needsAttentionRows, type NeedsAttentionInput } from "./needs-attention";
import { checklistSummary, type ChecklistCounts } from "./checklist";

const TODAY = new Date("2026-09-10T12:00:00Z");

const caughtUp: ChecklistCounts = {
  incompleteForms: 0,
  unsignedContracts: 0,
  openInvoices: 0,
  unreadMessages: 0,
  openResources: 0,
  upcomingConsults: 0,
};

/** Jordan's Home in the screenshot: three forms, three to sign, three to pay, one visit. */
const jordan: ChecklistCounts = {
  incompleteForms: 3,
  unsignedContracts: 3,
  openInvoices: 3,
  unreadMessages: 0,
  openResources: 0,
  upcomingConsults: 1,
};

const overdue: NeedsAttentionInput = {
  clientId: "c1",
  name: "Amara Alderman",
  stage: "consult_done",
  followUpDueOn: "2026-09-01",
  reviewed: false,
  hasPrimaryDoula: false,
  stageEnteredAt: new Date("2026-09-02T12:00:00Z"),
  lastNoteAt: null,
};

const quiet: NeedsAttentionInput = {
  ...overdue,
  clientId: "c2",
  name: "Blythe Okonkwo",
  stage: "outreach_sent",
  followUpDueOn: "2026-09-20",
  reviewed: true,
  hasPrimaryDoula: true,
  lastNoteAt: new Date("2026-09-03T12:00:00Z"),
};

describe("the agency review queue is a link, not prose", () => {
  it("keeps the words from the screenshot and counts one item per family", () => {
    expect(reviewQueueSummary(6)).toBe("6 items need your review");
    expect(reviewQueueSummary(1)).toBe("1 item needs your review");
    expect(reviewQueueSummary(0)).toBe("Nothing needs your review");
  });

  it("hands the page a destination with every summary", () => {
    const link = reviewQueueLink(6);
    expect(link.label).toBe(reviewQueueSummary(6));
    expect(link.href).toBe(REVIEW_BOARD_HREF);
    expect(REVIEW_BOARD_HREF.startsWith("/doula/")).toBe(true);
  });
});

describe("review board", () => {
  const rows = reviewBoard(needsAttentionRows([overdue, quiet], TODAY));

  it("lists only families with something to do, worst first", () => {
    expect(rows.map((row) => row.name)).toEqual(["Amara Alderman"]);
    expect(rows[0].tasks.map((task) => task.key)).toEqual([
      "follow_up_overdue",
      "consult_note_missing",
      "unmatched",
      "unreviewed",
    ]);
  });

  it("gives every task a fix and a real place to do it", () => {
    for (const task of rows[0].tasks) {
      expect(task.action.trim()).toBeTruthy();
      expect(task.href).toMatch(/^\/doula\/clients\/c1#[a-z-]+$/);
      // The action says what to do; the label only says what is wrong.
      expect(task.action).not.toBe(task.label);
    }
  });

  it("sends each reason to the section that clears it", () => {
    const byKey = Object.fromEntries(rows[0].tasks.map((task) => [task.key, task.href]));
    expect(byKey.unmatched).toBe("/doula/clients/c1#care-team");
    expect(byKey.consult_note_missing).toBe("/doula/clients/c1#notes");
    expect(byKey.follow_up_overdue).toBe("/doula/clients/c1#lead-details");
  });

  it("carries the family's other surfaces so the board is not a dead end", () => {
    expect(rows[0].surfaces.map((link) => link.label)).toEqual([
      "Record",
      "Forms",
      "Agreement & invoices",
      "Messages",
    ]);
    for (const link of familySurfaceLinks("c1")) {
      expect(link.href.startsWith("/doula/clients/c1")).toBe(true);
    }
  });

  it("counts the work, not just the families", () => {
    expect(rows).toHaveLength(1);
    expect(reviewTaskCount(needsAttentionRows([overdue, quiet], TODAY))).toBe(4);
  });

  it("keeps the stage raw so the page can word it per persona", () => {
    expect(rows[0].stage).toBe("consult_done");
  });
});

describe("the family waiting queue is a link, not prose", () => {
  it("says exactly what Home says, and opens the board", () => {
    const link = waitingQueueLink(jordan);
    expect(link.label).toBe("9 things waiting for you");
    expect(link.label).toBe(checklistSummary(jordan));
    expect(link.href).toBe(WAITING_BOARD_HREF);
    expect(WAITING_BOARD_HREF.startsWith("/portal/")).toBe(true);
  });
});

describe("waiting board", () => {
  const board = waitingBoard(jordan, "Priya Raman");

  it("opens on the same summary Home prints", () => {
    expect(board.summary).toBe("9 things waiting for you");
  });

  it("puts the chores she owes on top, in checklist order", () => {
    expect(board.open.map((item) => item.key)).toEqual([
      "incompleteForms",
      "unsignedContracts",
      "openInvoices",
    ]);
    expect(board.open.map((item) => item.ask)).toEqual([
      "3 forms to fill in",
      "3 agreements to read and sign",
      "3 invoices open",
    ]);
  });

  it("sends every row to a real portal surface", () => {
    const hrefs = Object.fromEntries(
      [...board.open, ...board.alsoHere, ...board.done].map((item) => [item.key, item.href]),
    );
    expect(hrefs).toEqual({
      incompleteForms: "/portal/forms",
      unsignedContracts: "/portal/contract",
      openInvoices: "/portal/pay",
      unreadMessages: "/portal/messages",
      openResources: "/portal/resources",
      upcomingConsults: "/portal/calendar",
    });
  });

  it("keeps handouts and visits out of the homework pile", () => {
    expect(board.alsoHere.map((item) => item.key)).toEqual([
      "openResources",
      "upcomingConsults",
    ]);
    expect(board.alsoHere[1].ask).toBe("1 visit booked with Priya Raman");
    expect(board.alsoHere.every((item) => item.tone === "ink")).toBe(true);
  });

  it("still says what is finished", () => {
    expect(board.done.map((item) => item.key)).toEqual(["unreadMessages"]);
    expect(board.done[0].ask).toBe("No new messages from Priya Raman");

    const clear = waitingBoard(caughtUp, "Priya Raman");
    expect(clear.open).toHaveLength(0);
    expect(clear.summary).toBe("Nothing waiting on you today");
    expect(clear.done.map((item) => item.ask)).toEqual([
      "Your forms are all in",
      "Your agreement is signed",
      "Nothing to pay right now",
      "No new messages from Priya Raman",
    ]);
  });

  it("never teases a locked shelf", () => {
    const locked = waitingBoard({ ...jordan, openResources: 3 }, "Priya Raman", {
      resourcesLocked: true,
    });
    const resources = locked.alsoHere.find((item) => item.key === "openResources");
    expect(resources?.locked).toBe(true);
    expect(resources?.ask).toBe("Opens after signing");
    expect(resources?.ask).not.toMatch(/\d/);
  });

  it("names the doula everywhere it could have said 'your doula'", () => {
    const text = [...board.open, ...board.alsoHere, ...board.done]
      .flatMap((item) => [item.ask, item.detail])
      .join(" ");
    expect(text).toContain("Priya Raman");
    expect(text).not.toMatch(/your doula|the provider/i);
  });

  it("speaks no office vocabulary at a family", () => {
    const text = [board.summary, ...board.open, ...board.alsoHere, ...board.done]
      .flatMap((item) =>
        typeof item === "string" ? [item] : [item.title, item.ask, item.detail, item.action],
      )
      .join(" ");
    expect(text).not.toMatch(/\blead\b|pipeline|funnel|\bstage\b|intake|prospect/i);
  });
});
