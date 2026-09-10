import { describe, expect, it } from "vitest";
import {
  COMPOSER_COPY,
  MESSAGE_INBOX_FILTERS,
  buildInboxThreads,
  countForFilter,
  filterThreads,
  inboxEmptyState,
  inboxFilterLabel,
  inboxSummaryLine,
  messagesHref,
  parseInboxFilter,
  pinActionLabel,
  portalHeaderLine,
  portalMessageAffordance,
  portalThreadEmpty,
  previewSpeaker,
  sortInboxThreads,
  staffThreadCardHint,
  staffThreadCardTitle,
  staffThreadEmpty,
  threadPickerCopy,
  totalUnread,
  unreadBadgeCopy,
  unreadGlanceLabel,
  waitingCount,
} from "./message-inbox";
import type { InboxThread } from "./message-inbox";
import type { ThreadSummary } from "./messages";

const at = (iso: string) => new Date(iso);

const summary = (
  clientId: string,
  clientName: string,
  lastSentAt: string,
  unreadInbound = 0,
): ThreadSummary => ({
  clientId,
  clientName,
  lastBody: `last from ${clientName}`,
  lastDirection: unreadInbound > 0 ? "inbound" : "outbound",
  lastSentAt: at(lastSentAt),
  unreadInbound,
  total: 3,
});

const jordan = summary("c-jordan", "Jordan Blake", "2026-09-09T10:00:00.000Z", 2);
const maya = summary("c-maya", "Maya Rivers", "2026-09-10T09:00:00.000Z");
const avery = summary("c-avery", "Avery Stone", "2026-09-05T08:00:00.000Z", 1);

const inbox = (pinned: string[] = []) => buildInboxThreads([jordan, maya, avery], pinned);

describe("inbox filters (TOK-56)", () => {
  it("offers exactly All, Unread and Pinned, in the founder's order", () => {
    expect(MESSAGE_INBOX_FILTERS.map((filter) => filter.key)).toEqual([
      "all",
      "unread",
      "pinned",
    ]);
    expect(MESSAGE_INBOX_FILTERS.map((filter) => filter.label)).toEqual([
      "All",
      "Unread",
      "Pinned",
    ]);
  });

  it("reads the filter off the query string and falls back to All", () => {
    expect(parseInboxFilter("unread")).toBe("unread");
    expect(parseInboxFilter("pinned")).toBe("pinned");
    expect(parseInboxFilter("all")).toBe("all");
    expect(parseInboxFilter("archived")).toBe("all");
    expect(parseInboxFilter(undefined)).toBe("all");
    expect(parseInboxFilter(["pinned", "unread"])).toBe("pinned");
  });

  it("labels a filter from the config, not from the caller", () => {
    expect(inboxFilterLabel("unread")).toBe("Unread");
    expect(inboxFilterLabel("pinned")).toBe("Pinned");
  });

  it("keeps everything under All", () => {
    const threads = inbox();
    expect(filterThreads(threads, "all")).toHaveLength(3);
  });

  it("Unread means a family is still waiting on a reply", () => {
    const threads = inbox();
    expect(filterThreads(threads, "unread").map((thread) => thread.clientId)).toEqual([
      "c-jordan",
      "c-avery",
    ]);
  });

  it("Pinned means this staffer pinned it", () => {
    const threads = inbox(["c-maya"]);
    expect(filterThreads(threads, "pinned").map((thread) => thread.clientId)).toEqual([
      "c-maya",
    ]);
  });

  it("counts each tab so a tab never opens on a surprise", () => {
    const threads = inbox(["c-maya", "c-avery"]);
    expect(countForFilter(threads, "all")).toBe(3);
    expect(countForFilter(threads, "unread")).toBe(2);
    expect(countForFilter(threads, "pinned")).toBe(2);
  });

  it("never mutates the list it was handed", () => {
    const threads = inbox(["c-maya"]);
    const before = threads.map((thread) => thread.clientId);
    filterThreads(threads, "unread");
    sortInboxThreads(threads);
    expect(threads.map((thread) => thread.clientId)).toEqual(before);
  });
});

describe("inbox ordering (TOK-56)", () => {
  it("sorts newest first when nothing is pinned", () => {
    expect(inbox().map((thread) => thread.clientId)).toEqual([
      "c-maya",
      "c-jordan",
      "c-avery",
    ]);
  });

  it("floats pinned conversations above newer unpinned ones", () => {
    expect(inbox(["c-avery"]).map((thread) => thread.clientId)).toEqual([
      "c-avery",
      "c-maya",
      "c-jordan",
    ]);
  });

  it("keeps pinned threads among themselves in newest-first order", () => {
    expect(inbox(["c-avery", "c-jordan"]).map((thread) => thread.clientId)).toEqual([
      "c-jordan",
      "c-avery",
      "c-maya",
    ]);
  });

  it("breaks a same-instant tie on the family name rather than at random", () => {
    const threads = buildInboxThreads([
      summary("c-b", "Wren Ellis", "2026-09-10T09:00:00.000Z"),
      summary("c-a", "Avery Stone", "2026-09-10T09:00:00.000Z"),
    ]);
    expect(threads.map((thread) => thread.clientName)).toEqual([
      "Avery Stone",
      "Wren Ellis",
    ]);
  });

  it("carries the pin flag and avatar initials onto every row", () => {
    const [top] = inbox(["c-maya"]);
    expect(top.pinned).toBe(true);
    expect(top.initials).toBe("MR");
    expect(inbox().every((thread) => thread.pinned === false)).toBe(true);
  });
});

describe("unread glance (TOK-56 / TOK-58)", () => {
  it("counts the families waiting, not the messages", () => {
    expect(waitingCount(inbox())).toBe(2);
    expect(totalUnread(inbox())).toBe(3);
  });

  it("says nothing is waiting when nothing is", () => {
    const threads = buildInboxThreads([maya]);
    expect(waitingCount(threads)).toBe(0);
    expect(inboxSummaryLine(threads)).toBe("1 thread · nothing waiting on you");
  });

  it("leads the header with how many families are waiting", () => {
    expect(inboxSummaryLine(inbox())).toBe("3 threads · 2 waiting on you");
  });

  it("words the badge and the screen-reader glance", () => {
    expect(unreadBadgeCopy(3)).toBe("3 unread");
    expect(unreadGlanceLabel("Jordan Blake", 1)).toBe("Jordan Blake — 1 unread message");
    expect(unreadGlanceLabel("Jordan Blake", 2)).toBe("Jordan Blake — 2 unread messages");
  });

  it("prefixes the preview with You only when the practice wrote last", () => {
    expect(previewSpeaker("outbound")).toBe("You");
    expect(previewSpeaker("inbound")).toBeNull();
  });
});

describe("pin copy (TOK-56)", () => {
  it("names the family in the pin verb", () => {
    expect(pinActionLabel(false, "Jordan Blake")).toBe("Pin Jordan Blake to the top");
    expect(pinActionLabel(true, "Jordan Blake")).toBe("Unpin Jordan Blake");
  });
});

describe("empty states (TOK-56)", () => {
  it("reads an empty Unread tab as good news", () => {
    expect(inboxEmptyState("unread").title).toBe("No unread threads");
    expect(inboxEmptyState("unread").body).toContain("Nothing is sitting here waiting");
  });

  it("teaches the pin on an empty Pinned tab", () => {
    expect(inboxEmptyState("pinned").title).toBe("Nothing pinned yet");
    expect(inboxEmptyState("pinned").body).toContain("Pin the family");
  });

  it("invites a first thread when the whole inbox is empty", () => {
    expect(inboxEmptyState("all").title).toBe("No conversations yet");
  });

  it("names the family on the staff side of an empty thread", () => {
    expect(staffThreadEmpty("Jordan").body).toContain("Nothing from Jordan yet");
  });

  it("names the doula on the family side of an empty thread", () => {
    expect(portalThreadEmpty("Priya").body).toContain("Priya answers here");
  });

  it("tells the splash pane how many are waiting", () => {
    expect(threadPickerCopy(0).body).toContain("Choose a family");
    expect(threadPickerCopy(1).body).toContain("1 family is waiting on you");
    expect(threadPickerCopy(4).body).toContain("4 families are waiting on you");
  });
});

describe("family thread copy (TOK-38 / TOK-56)", () => {
  it("opens a brand-new thread with the doula's whole name", () => {
    expect(
      portalHeaderLine({ total: 0, unread: 0, doulaName: "Priya Raman", doulaFirstName: "Priya" }),
    ).toBe("One thread with Priya Raman, kept inside your portal.");
  });

  it("says what is new and that reading it clears it", () => {
    expect(
      portalHeaderLine({ total: 5, unread: 2, doulaName: "Priya Raman", doulaFirstName: "Priya" }),
    ).toBe("2 new from Priya — reading this clears it.");
  });

  it("says up to date once nothing is unread", () => {
    expect(
      portalHeaderLine({ total: 5, unread: 0, doulaName: "Priya Raman", doulaFirstName: "Priya" }),
    ).toBe("You are up to date with Priya.");
  });

  it("keeps the care-team affordance pointed at the one thread route", () => {
    const affordance = portalMessageAffordance("Priya Raman");
    expect(affordance.href).toBe("/portal/messages");
    expect(affordance.label).toBe("Message");
    expect(affordance.ariaLabel).toBe("Message Priya Raman");
  });
});

describe("composer voice (TOK-56)", () => {
  it("writes to a person on each side", () => {
    expect(COMPOSER_COPY.staff.placeholder("the Blake family")).toBe(
      "Write to the Blake family…",
    );
    expect(COMPOSER_COPY.portal.placeholder("Priya")).toBe("Write to Priya…");
  });

  it("reassures with a person and a place, on both sides", () => {
    expect(COMPOSER_COPY.staff.hint("Jordan Rivera")).toBe(
      "Jordan Rivera reads this next time they open their portal.",
    );
    expect(COMPOSER_COPY.portal.hint("Priya")).toBe(
      "Just you and Priya, kept in your portal.",
    );
  });

  /**
   * Vera's fourth fail bar: the thread must never lead with what it is not. "No SMS in
   * this milestone" was a roadmap note printed under a family's composer.
   */
  it("never leads with the plumbing", () => {
    for (const hint of [COMPOSER_COPY.staff.hint("Jordan"), COMPOSER_COPY.portal.hint("Priya")]) {
      expect(hint).not.toMatch(/SMS|milestone|not a text|email thread/i);
    }
  });
});

describe("the thread card on a family's record (TOK-56)", () => {
  it("names the conversation after the person in it", () => {
    expect(staffThreadCardTitle("Jordan Rivera")).toBe("Messages with Jordan Rivera");
    expect(staffThreadCardHint("Jordan Rivera")).toBe(
      "The same thread Jordan Rivera sees in their portal.",
    );
  });

  it("does not call a conversation a table", () => {
    expect(staffThreadCardTitle("Jordan Rivera")).not.toMatch(/portal messages/i);
  });
});

describe("deep links (TOK-56)", () => {
  it("keeps the plain inbox at the plain path", () => {
    expect(messagesHref()).toBe("/doula/messages");
    expect(messagesHref({ filter: "all" })).toBe("/doula/messages");
  });

  it("addresses a filter and an open thread on the same route", () => {
    expect(messagesHref({ filter: "unread" })).toBe("/doula/messages?filter=unread");
    expect(messagesHref({ clientId: "c-jordan" })).toBe("/doula/messages?client=c-jordan");
    expect(messagesHref({ clientId: "c-jordan", filter: "pinned" })).toBe(
      "/doula/messages?filter=pinned&client=c-jordan",
    );
  });

  it("drops an absent client rather than writing an empty param", () => {
    expect(messagesHref({ clientId: null, filter: "unread" })).toBe(
      "/doula/messages?filter=unread",
    );
  });
});

describe("filter predicates hold on a hand-built row", () => {
  it("treats unreadInbound > 0 as unread, whatever the last direction was", () => {
    const rows: InboxThread[] = [
      { ...summary("a", "A", "2026-09-10T09:00:00.000Z", 0), pinned: false, initials: "A" },
      { ...summary("b", "B", "2026-09-10T08:00:00.000Z", 1), pinned: false, initials: "B" },
    ];
    rows[0].lastDirection = "inbound";
    expect(filterThreads(rows, "unread").map((row) => row.clientId)).toEqual(["b"]);
  });
});
