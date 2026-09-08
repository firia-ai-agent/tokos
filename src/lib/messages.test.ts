import { describe, expect, it } from "vitest";
import {
  chronological,
  dayLabel,
  groupByDay,
  isOwnMessage,
  messageStamp,
  previewLine,
  summarizeThreads,
  unreadFor,
} from "./messages";

const NOW = new Date("2026-09-08T15:00:00.000Z");
const at = (iso: string) => new Date(iso);

const message = (
  id: string,
  direction: "inbound" | "outbound",
  sentAt: string,
  readAt: string | null = null,
) => ({
  id,
  direction,
  body: `body ${id}`,
  sentAt: at(sentAt),
  readAt: readAt ? at(readAt) : null,
});

describe("thread ordering", () => {
  it("reads oldest first whatever order the query returned", () => {
    const rows = [
      message("c", "inbound", "2026-09-08T12:00:00.000Z"),
      message("a", "outbound", "2026-09-06T09:00:00.000Z"),
      message("b", "inbound", "2026-09-07T09:00:00.000Z"),
    ];
    expect(chronological(rows).map((row) => row.id)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the rows it was handed", () => {
    const rows = [
      message("c", "inbound", "2026-09-08T12:00:00.000Z"),
      message("a", "outbound", "2026-09-06T09:00:00.000Z"),
    ];
    chronological(rows);
    expect(rows.map((row) => row.id)).toEqual(["c", "a"]);
  });
});

describe("timestamps", () => {
  it("counts minutes, hours, then days before falling back to a date", () => {
    expect(messageStamp(at("2026-09-08T14:59:40.000Z"), NOW)).toBe("Just now");
    expect(messageStamp(at("2026-09-08T14:12:00.000Z"), NOW)).toBe("48 min ago");
    expect(messageStamp(at("2026-09-08T12:00:00.000Z"), NOW)).toBe("3 hrs ago");
    expect(messageStamp(at("2026-09-07T14:00:00.000Z"), NOW)).toBe("1 day ago");
    expect(messageStamp(at("2026-09-05T14:00:00.000Z"), NOW)).toBe("3 days ago");
    expect(messageStamp(at("2026-08-01T14:00:00.000Z"), NOW)).toBe("Aug 1, 2026");
  });

  it("singularises one hour", () => {
    expect(messageStamp(at("2026-09-08T14:00:00.000Z"), NOW)).toBe("1 hr ago");
  });

  it("names today and yesterday before printing a weekday", () => {
    expect(dayLabel(at("2026-09-08T09:00:00.000Z"), NOW)).toBe("Today");
    expect(dayLabel(at("2026-09-07T09:00:00.000Z"), NOW)).toBe("Yesterday");
    expect(dayLabel(at("2026-09-02T09:00:00.000Z"), NOW)).toBe("Wednesday, September 2");
  });
});

describe("day grouping", () => {
  it("splits a sorted thread into day runs", () => {
    const days = groupByDay(
      [
        message("b", "inbound", "2026-09-08T09:00:00.000Z"),
        message("a", "outbound", "2026-09-07T09:00:00.000Z"),
        message("c", "outbound", "2026-09-08T11:00:00.000Z"),
      ],
      NOW,
    );
    expect(days.map((day) => day.label)).toEqual(["Yesterday", "Today"]);
    expect(days[1].messages.map((m) => m.id)).toEqual(["b", "c"]);
  });

  it("returns nothing for an empty thread", () => {
    expect(groupByDay([], NOW)).toEqual([]);
  });
});

describe("sides of the thread", () => {
  it("puts each viewer's own writing on their own side", () => {
    expect(isOwnMessage("inbound", "client")).toBe(true);
    expect(isOwnMessage("outbound", "client")).toBe(false);
    expect(isOwnMessage("outbound", "doula")).toBe(true);
    expect(isOwnMessage("inbound", "doula")).toBe(false);
  });

  it("counts only the other side's unread rows", () => {
    const rows = [
      message("a", "outbound", "2026-09-06T09:00:00.000Z"),
      message("b", "outbound", "2026-09-07T09:00:00.000Z", "2026-09-07T10:00:00.000Z"),
      message("c", "inbound", "2026-09-07T11:00:00.000Z"),
    ];
    expect(unreadFor(rows, "client")).toBe(1);
    expect(unreadFor(rows, "doula")).toBe(1);
    expect(unreadFor([], "client")).toBe(0);
  });
});

describe("doula inbox threads", () => {
  const rows = [
    {
      clientId: "jordan",
      clientName: "Jordan",
      message: message("j2", "inbound", "2026-09-08T12:00:00.000Z"),
    },
    {
      clientId: "avery",
      clientName: "Avery",
      message: message("a1", "outbound", "2026-09-08T13:00:00.000Z"),
    },
    {
      clientId: "jordan",
      clientName: "Jordan",
      message: message("j1", "outbound", "2026-09-06T09:00:00.000Z"),
    },
    {
      clientId: "jordan",
      clientName: "Jordan",
      message: message("j0", "inbound", "2026-09-05T09:00:00.000Z", "2026-09-05T10:00:00.000Z"),
    },
  ];

  it("collapses to one row per family, newest conversation first", () => {
    const threads = summarizeThreads(rows);
    expect(threads.map((thread) => thread.clientId)).toEqual(["avery", "jordan"]);
    expect(threads[1].total).toBe(3);
  });

  it("previews the newest message whatever order rows arrived in", () => {
    const [, jordan] = summarizeThreads(rows);
    expect(jordan.lastBody).toBe("body j2");
    expect(jordan.lastDirection).toBe("inbound");
    expect(jordan.lastSentAt).toEqual(at("2026-09-08T12:00:00.000Z"));
  });

  it("counts only the family's own unread lines as waiting on the doula", () => {
    const [avery, jordan] = summarizeThreads(rows);
    expect(jordan.unreadInbound).toBe(1);
    expect(avery.unreadInbound).toBe(0);
  });

  it("has nothing to show for an empty inbox", () => {
    expect(summarizeThreads([])).toEqual([]);
  });
});

describe("previewLine", () => {
  it("flattens newlines so a card stays one line", () => {
    expect(previewLine("first\n\nsecond   third")).toBe("first second third");
  });

  it("truncates with an ellipsis past the limit", () => {
    expect(previewLine("abcdefghij", 5)).toBe("abcd…");
    expect(previewLine("abcde", 5)).toBe("abcde");
  });
});
