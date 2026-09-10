import { differenceInCalendarDays, format, isSameDay, subDays } from "date-fns";

/**
 * Portal messaging is one thread per family, rendered from the same rows on both sides:
 * the family sees it at `/portal/messages`, the doula on the client record. Everything in
 * here is pure so the ordering, the read counters, and the stamps can be tested without a
 * database — the queries stay in the pages, org+client scoped as always.
 */

export type MessageDirection = "inbound" | "outbound";

export type ThreadMessage = {
  id: string;
  direction: string;
  body: string;
  sentAt: Date;
  readAt: Date | null;
};

/** A chat reads top-to-bottom: oldest first, newest sitting against the composer. */
export function chronological<T extends { sentAt: Date }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());
}

/**
 * Relative while a conversation is live, a real date once it is history. `now` is a
 * parameter so this is deterministic in tests and stable inside one render pass.
 */
export function messageStamp(sentAt: Date, now: Date = new Date()): string {
  const minutes = Math.floor((now.getTime() - sentAt.getTime()) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return format(sentAt, "MMM d, yyyy");
}

/**
 * The tighter stamp a conversation list wants (TOK-56). WhatsApp does not print "23 hrs
 * ago" down the side of forty rows — it prints a time today, a weekday this week and a
 * date beyond that, so the column stays one short word wide. The full stamp still rides
 * along in the `title`.
 */
export function inboxStamp(sentAt: Date, now: Date = new Date()): string {
  if (isSameDay(sentAt, now)) return format(sentAt, "h:mm a");
  if (isSameDay(sentAt, subDays(now, 1))) return "Yesterday";
  const days = differenceInCalendarDays(now, sentAt);
  if (days > 1 && days < 7) return format(sentAt, "EEE");
  return format(sentAt, "MMM d");
}

/** The unambiguous version, for the `title` on every stamp. */
export function messageStampFull(sentAt: Date): string {
  return format(sentAt, "EEEE, MMMM d, yyyy 'at' h:mm a");
}

export function dayLabel(day: Date, now: Date = new Date()): string {
  if (isSameDay(day, now)) return "Today";
  if (isSameDay(day, subDays(now, 1))) return "Yesterday";
  return format(day, "EEEE, MMMM d");
}

export type MessageDay<T> = { key: string; label: string; messages: T[] };

/** Chronological messages split into day runs, so the thread can print date dividers. */
export function groupByDay<T extends { sentAt: Date }>(
  rows: readonly T[],
  now: Date = new Date(),
): MessageDay<T>[] {
  const days: MessageDay<T>[] = [];
  for (const message of chronological(rows)) {
    const key = format(message.sentAt, "yyyy-MM-dd");
    const current = days[days.length - 1];
    if (current && current.key === key) {
      current.messages.push(message);
    } else {
      days.push({ key, label: dayLabel(message.sentAt, now), messages: [message] });
    }
  }
  return days;
}

/**
 * Whose bubble is this? The family writes `inbound`, the doula writes `outbound`, so the
 * same row lands on the right for whoever is looking at it.
 */
export function isOwnMessage(direction: string, viewer: "client" | "doula"): boolean {
  return viewer === "client" ? direction === "inbound" : direction === "outbound";
}

/** Unread on each side: the family owes nothing on its own `inbound` rows, and vice versa. */
export function unreadFor(
  rows: readonly { direction: string; readAt: Date | null }[],
  viewer: "client" | "doula",
): number {
  const theirs: MessageDirection = viewer === "client" ? "outbound" : "inbound";
  return rows.filter((row) => row.direction === theirs && row.readAt === null).length;
}

export type ThreadRow = {
  clientId: string;
  clientName: string;
  message: ThreadMessage;
};

export type ThreadSummary = {
  clientId: string;
  clientName: string;
  lastBody: string;
  lastDirection: string;
  lastSentAt: Date;
  unreadInbound: number;
  total: number;
};

/**
 * The doula inbox: one row per family, newest conversation first, carrying the last line
 * and how many of that family's messages are still unread.
 */
export function summarizeThreads(rows: readonly ThreadRow[]): ThreadSummary[] {
  const byClient = new Map<string, ThreadSummary>();
  for (const row of rows) {
    const unread = row.message.direction === "inbound" && row.message.readAt === null ? 1 : 0;
    const existing = byClient.get(row.clientId);
    if (!existing) {
      byClient.set(row.clientId, {
        clientId: row.clientId,
        clientName: row.clientName,
        lastBody: row.message.body,
        lastDirection: row.message.direction,
        lastSentAt: row.message.sentAt,
        unreadInbound: unread,
        total: 1,
      });
      continue;
    }
    existing.total += 1;
    existing.unreadInbound += unread;
    if (row.message.sentAt.getTime() > existing.lastSentAt.getTime()) {
      existing.lastBody = row.message.body;
      existing.lastDirection = row.message.direction;
      existing.lastSentAt = row.message.sentAt;
    }
  }
  return [...byClient.values()].sort((a, b) => b.lastSentAt.getTime() - a.lastSentAt.getTime());
}

/** One line of preview — a long message should not push the unread badge off the card. */
export function previewLine(body: string, max = 120): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}
