/**
 * The messages surface, as configuration (TOK-56).
 *
 * The founder asked for WhatsApp: one dense list of conversations, pins that float to the
 * top, filters for Unread and Pinned, and something that says at a glance which families
 * are waiting. None of that is hard — what is hard is keeping it one product six edits
 * from now, so every string a doula or a family reads on a messages screen is declared
 * here and rendered from the declaration. Filter labels, unread badge wording, pin verbs,
 * empty states, composer placeholders: one module, no loose strings in JSX.
 *
 * Everything is pure. The pins are rows in `portal_thread_pins` and the messages are rows
 * in `portal_messages`, but ordering, filtering and counting are decided here so they can
 * be tested without a database — the same split `@/lib/messages` already uses.
 */

import { initialsOf } from "@/lib/photo";
import type { ThreadSummary } from "@/lib/messages";

/* ----------------------------------------------------------------- filters */

export type MessageInboxFilterKey = "all" | "unread" | "pinned";

export type MessageInboxFilter = {
  key: MessageInboxFilterKey;
  label: string;
  /** Screen-reader wording for the tab, since "Unread" alone is a fragment. */
  description: string;
  /**
   * What the column says when this filter matches nothing. An inbox with no unread is
   * good news and should read like it, not like a failed search.
   */
  empty: { title: string; body: string };
};

/** All / Unread / Pinned — the founder's three, in the order she wrote them. */
export const MESSAGE_INBOX_FILTERS: readonly MessageInboxFilter[] = [
  {
    key: "all",
    label: "All",
    description: "Every conversation",
    empty: {
      title: "No conversations yet",
      body: "Every family you write to lands here as one thread, newest first. Open a family record to start one.",
    },
  },
  {
    key: "unread",
    label: "Unread",
    description: "Families waiting on a reply",
    empty: {
      title: "No unread threads",
      body: "Everyone who wrote to you has been read. Nothing is sitting here waiting.",
    },
  },
  {
    key: "pinned",
    label: "Pinned",
    description: "Conversations you pinned to the top",
    empty: {
      title: "Nothing pinned yet",
      body: "Pin the family you are on call for and their thread stays at the top of this list.",
    },
  },
] as const;

export const DEFAULT_MESSAGE_INBOX_FILTER: MessageInboxFilterKey = "all";

/** A filter from the query string. Anything unrecognised falls back to All. */
export function parseInboxFilter(value: unknown): MessageInboxFilterKey {
  const key = Array.isArray(value) ? value[0] : value;
  const match = MESSAGE_INBOX_FILTERS.find((filter) => filter.key === key);
  return match?.key ?? DEFAULT_MESSAGE_INBOX_FILTER;
}

export function inboxFilter(key: MessageInboxFilterKey): MessageInboxFilter {
  return MESSAGE_INBOX_FILTERS.find((filter) => filter.key === key) ?? MESSAGE_INBOX_FILTERS[0];
}

export function inboxFilterLabel(key: MessageInboxFilterKey): string {
  return inboxFilter(key).label;
}

/** The empty state for whichever filter emptied the list. */
export function inboxEmptyState(key: MessageInboxFilterKey): { title: string; body: string } {
  return inboxFilter(key).empty;
}

/* ----------------------------------------------------------------- threads */

/**
 * One conversation as the inbox needs it: the thread summary, whether this staffer has
 * pinned it, and the initials the avatar chip draws when there is no photo of a family.
 */
export type InboxThread = ThreadSummary & {
  pinned: boolean;
  initials: string;
};

/**
 * Pinned first, then newest — WhatsApp's order exactly. Ties break on the family name so
 * two threads stamped in the same second do not swap places between renders.
 */
export function sortInboxThreads(threads: readonly InboxThread[]): InboxThread[] {
  return [...threads].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const byRecency = b.lastSentAt.getTime() - a.lastSentAt.getTime();
    if (byRecency !== 0) return byRecency;
    return a.clientName.localeCompare(b.clientName);
  });
}

/** Thread summaries plus this staffer's pins, in the order the list renders them. */
export function buildInboxThreads(
  summaries: readonly ThreadSummary[],
  pinnedClientIds: Iterable<string> = [],
): InboxThread[] {
  const pinned = new Set(pinnedClientIds);
  return sortInboxThreads(
    summaries.map((summary) => ({
      ...summary,
      pinned: pinned.has(summary.clientId),
      initials: initialsOf(summary.clientName),
    })),
  );
}

/** Unread means this family is still waiting on a reply from the practice. */
export function threadIsUnread(thread: Pick<InboxThread, "unreadInbound">): boolean {
  return thread.unreadInbound > 0;
}

/** All keeps everything; Unread and Pinned are exactly what they say. */
export function filterThreads(
  threads: readonly InboxThread[],
  filter: MessageInboxFilterKey,
): InboxThread[] {
  if (filter === "unread") return threads.filter(threadIsUnread);
  if (filter === "pinned") return threads.filter((thread) => thread.pinned);
  return [...threads];
}

/** The number beside a filter tab. A tab that would open on nothing says so up front. */
export function countForFilter(
  threads: readonly InboxThread[],
  filter: MessageInboxFilterKey,
): number {
  return filterThreads(threads, filter).length;
}

/** How many families are still waiting — the number the header leads with. */
export function waitingCount(threads: readonly InboxThread[]): number {
  return threads.filter(threadIsUnread).length;
}

/** Every unread message across the inbox, for the nav-level glance. */
export function totalUnread(threads: readonly InboxThread[]): number {
  return threads.reduce((sum, thread) => sum + thread.unreadInbound, 0);
}

/* -------------------------------------------------------------------- copy */

export const MESSAGES_TITLE = "Messages";

/** "4 threads · 2 waiting on you". Nothing waiting is worth saying out loud too. */
export function inboxSummaryLine(threads: readonly InboxThread[]): string {
  const count = threads.length;
  const waiting = waitingCount(threads);
  const threadsPart = `${count} thread${count === 1 ? "" : "s"}`;
  return `${threadsPart} · ${waiting === 0 ? "nothing waiting on you" : `${waiting} waiting on you`}`;
}

/** The coral pill on an unread row. */
export function unreadBadgeCopy(count: number): string {
  return `${count} unread`;
}

/**
 * What a screen reader gets from the glance dot. The dot is colour and position only, so
 * the family and the count have to be said in words somewhere.
 */
export function unreadGlanceLabel(clientName: string, count: number): string {
  return `${clientName} — ${count} unread message${count === 1 ? "" : "s"}`;
}

/** The pin verb, and who it applies to. Buttons that only say "Pin" lie in a list. */
export function pinActionLabel(pinned: boolean, clientName: string): string {
  return pinned ? `Unpin ${clientName}` : `Pin ${clientName} to the top`;
}

/** The static marker on a pinned row, for the tooltip and the screen reader. */
export const PINNED_INDICATOR_LABEL = "Pinned to the top";

/** "You: " before the preview when the practice sent the last line. */
export function previewSpeaker(lastDirection: string): string | null {
  return lastDirection === "outbound" ? "You" : null;
}

/**
 * The right-hand pane before a conversation is picked. WhatsApp Web shows a splash here
 * rather than opening someone's thread unasked — opening a thread is what marks it read,
 * and a count should never drop because a page loaded.
 */
export function threadPickerCopy(waiting: number): { title: string; body: string } {
  return {
    title: "Pick a conversation",
    body:
      waiting > 0
        ? `${waiting} ${waiting === 1 ? "family is" : "families are"} waiting on you. Open a thread and it is marked read.`
        : "Choose a family on the left to read the thread and write back. Everything stays inside Tokos.",
  };
}

/** The staff side of an empty thread: a family who has not written yet, by name. */
export function staffThreadEmpty(familyName: string): { title: string; body: string } {
  return {
    title: "No messages yet",
    body: `Nothing from ${familyName} yet. Write the first note and it lands in their portal.`,
  };
}

/** The family side of an empty thread: their doula, by name (TOK-38). */
export function portalThreadEmpty(doulaFirstName: string): { title: string; body: string } {
  return {
    title: "Start the conversation",
    body: `Ask about a visit, a symptom you are wondering about, or anything on your mind. ${doulaFirstName} answers here, and it all stays in your portal.`,
  };
}

/**
 * The line under the family's Messages heading. One thread, one person, three states:
 * nothing yet, something new, or up to date.
 */
export function portalHeaderLine({
  total,
  unread,
  doulaName,
  doulaFirstName,
}: {
  total: number;
  unread: number;
  doulaName: string;
  doulaFirstName: string;
}): string {
  if (total === 0) return `One thread with ${doulaName}, kept inside your portal.`;
  if (unread > 0) {
    return `${unread} new from ${doulaFirstName} — reading this clears it.`;
  }
  return `You are up to date with ${doulaFirstName}.`;
}

/** The badge beside the family's thread while something is unread. */
export function portalUnreadBadge(unread: number): string {
  return `${unread} new`;
}

/**
 * Composer voice, per side (TOK-56, Vera).
 *
 * Both sides are writing to a person, so both hints name that person and say where the
 * words land. What they no longer do is lead with the plumbing: "No SMS in this milestone"
 * is a roadmap note, and a family reading "not a text, not an email thread" is being told
 * three things her message is not before she is told the one thing it is. The hint is one
 * short reassurance under the box, and reassurance is warm or it is noise.
 */
export const COMPOSER_COPY = {
  staff: {
    placeholder: (familyName: string) => `Write to ${familyName}…`,
    hint: (familyName: string) => `${familyName} reads this next time they open their portal.`,
    submitLabel: "Send",
  },
  portal: {
    placeholder: (doulaFirstName: string) => `Write to ${doulaFirstName}…`,
    hint: (doulaFirstName: string) => `Just you and ${doulaFirstName}, kept in your portal.`,
    submitLabel: "Send",
  },
} as const;

/**
 * The heading over the thread on a family's record (TOK-56, Vera).
 *
 * "Portal messages" is what the table is called, not what the card is. A doula opening
 * Jordan's record is looking at her conversation with Jordan, and naming it that is the
 * difference between a CRM panel and a thread — the same reason the inbox pane and the
 * family's own header both lead with a person.
 */
export function staffThreadCardTitle(familyName: string): string {
  return `Messages with ${familyName}`;
}

/** The quiet line under that heading: one conversation, two places to read it. */
export function staffThreadCardHint(familyName: string): string {
  return `The same thread ${familyName} sees in their portal.`;
}

/* --------------------------------------------------------------- deep links */

export const MESSAGES_BASE_PATH = "/doula/messages";

/**
 * One coherent address for the inbox: the filter and the open thread are both query
 * params on `/doula/messages`, so a doula can send someone "the unread list" or "Jordan's
 * thread" and it opens exactly there, with the inbox chrome still around it. The default
 * filter is left off the URL so the plain path stays the plain path.
 */
export function messagesHref({
  clientId,
  filter,
}: {
  clientId?: string | null;
  filter?: MessageInboxFilterKey;
} = {}): string {
  const params = new URLSearchParams();
  if (filter && filter !== DEFAULT_MESSAGE_INBOX_FILTER) params.set("filter", filter);
  if (clientId) params.set("client", clientId);
  const query = params.toString();
  return query ? `${MESSAGES_BASE_PATH}?${query}` : MESSAGES_BASE_PATH;
}

/** The family record behind a thread, for the "open their file" link in the pane. */
export function clientRecordHref(clientId: string): string {
  return `/doula/clients/${clientId}`;
}

/** Where the family's own thread lives. One route, linked from Home and the nav. */
export const PORTAL_MESSAGES_PATH = "/portal/messages";

/** The care-team affordance on family Home: the icon beside the doula's name (TOK-52). */
export function portalMessageAffordance(doulaName: string): {
  href: string;
  label: string;
  ariaLabel: string;
} {
  return {
    href: PORTAL_MESSAGES_PATH,
    label: "Message",
    ariaLabel: `Message ${doulaName}`,
  };
}
