import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, portalMessages, portalThreadPins } from "@/db/schema";
import { requireStaff } from "@/lib/tenancy";
import { summarizeThreads, unreadFor } from "@/lib/messages";
import { initialsOf } from "@/lib/photo";
import {
  COMPOSER_COPY,
  MESSAGES_TITLE,
  buildInboxThreads,
  filterThreads,
  inboxSummaryLine,
  parseInboxFilter,
  staffThreadEmpty,
  waitingCount,
} from "@/lib/message-inbox";
import type { InboxThread } from "@/lib/message-inbox";
import {
  markClientMessagesReadAction,
  sendClientMessageAction,
  toggleThreadPinAction,
} from "@/app/actions/doula";
import { MessageComposer, MessageThread } from "@/components/brand/messages";
import { MarkThreadRead } from "@/components/brand/mark-thread-read";
import {
  InboxFilterTabs,
  ThreadList,
  ThreadPaneHeader,
  ThreadPicker,
} from "@/components/brand/message-inbox";
import { cn } from "@/lib/utils";

/**
 * `/doula/messages` — the inbox the founder asked for: WhatsApp, not a list of links.
 *
 * One route holds both panes. The open thread and the filter are query params
 * (`?client=…&filter=unread`), so a doula can send a colleague "Jordan's thread" or "the
 * unread list" and it opens there with the inbox chrome still around it. On a phone the
 * two panes take turns: the list until a family is picked, the thread after.
 *
 * Nothing is auto-selected. Opening a thread is what stamps `read_at`, and the unread
 * rule behind Needs Attention (TOK-58) has to stay honest — a count must never drop
 * because a page loaded.
 */
export default async function DoulaMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; filter?: string }>;
}) {
  const query = await searchParams;
  const filter = parseInboxFilter(query.filter);
  const requestedClientId = query.client?.trim() || null;

  const staff = await requireStaff();
  const db = getDb();

  // Every message in the practice, with the family it belongs to. Org-scoped, as always.
  const rows = await db
    .select({ message: portalMessages, client: clients })
    .from(portalMessages)
    .innerJoin(clients, eq(clients.id, portalMessages.clientId))
    .where(eq(portalMessages.organizationId, staff.organizationId))
    .orderBy(desc(portalMessages.sentAt));

  // Pins are this staffer's own (TOK-56): Maya pinning tonight's family does not reorder
  // Priya's inbox.
  const pins = await db
    .select({ clientId: portalThreadPins.clientId })
    .from(portalThreadPins)
    .where(
      and(
        eq(portalThreadPins.organizationId, staff.organizationId),
        eq(portalThreadPins.userId, staff.userId),
      ),
    );

  const threads = buildInboxThreads(
    summarizeThreads(
      rows.map((row) => ({
        clientId: row.client.id,
        clientName: row.client.preferredName ?? row.client.displayName,
        message: row.message,
      })),
    ),
    pins.map((pin) => pin.clientId),
  );

  const visible = filterThreads(threads, filter);
  const waiting = waitingCount(threads);
  const now = new Date();

  // The open thread. A family with no messages yet is still addressable here — that is
  // what makes `?client=<id>` a link the client record can hand out — so the row is
  // synthesised from the client when there is no conversation to summarise. Read
  // org-scoped: a client id from another tenant resolves to nothing.
  const selected: InboxThread | null =
    threads.find((thread) => thread.clientId === requestedClientId) ??
    (requestedClientId ? await freshThread(requestedClientId) : null);

  async function freshThread(clientId: string): Promise<InboxThread | null> {
    const [client] = await db
      .select({
        id: clients.id,
        displayName: clients.displayName,
        preferredName: clients.preferredName,
      })
      .from(clients)
      .where(
        and(eq(clients.id, clientId), eq(clients.organizationId, staff.organizationId)),
      )
      .limit(1);
    if (!client) return null;
    const name = client.preferredName ?? client.displayName;
    return {
      clientId: client.id,
      clientName: name,
      lastBody: "",
      lastDirection: "outbound",
      lastSentAt: now,
      unreadInbound: 0,
      total: 0,
      pinned: pins.some((pin) => pin.clientId === client.id),
      initials: initialsOf(name),
    };
  }

  const selectedId = selected?.clientId ?? null;
  const messages = selectedId
    ? rows.filter((row) => row.client.id === selectedId).map((row) => row.message)
    : [];
  const unreadFromFamily = unreadFor(messages, "doula");
  const emptyThread = selected ? staffThreadEmpty(selected.clientName) : null;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-heading text-[28px] font-semibold tracking-[-0.02em] text-teal-ink">
          {MESSAGES_TITLE}
        </h1>
        <p className="mt-1.5 text-[14.5px] text-muted-foreground">
          {inboxSummaryLine(threads)}
        </p>
      </header>

      <InboxFilterTabs
        threads={threads}
        active={filter}
        selectedClientId={selected?.clientId}
      />

      {/* One column on a phone, two from `lg` — and `grid-cols-1` is `minmax(0,1fr)`,
          which is the whole fix for TOK-73's sideways scroll. An implicit `auto` track
          sizes to its content's *min-content*, and a row whose preview is `white-space:
          nowrap` has a min-content as wide as the sentence: the card grew to 680px inside
          a 358px page, `truncate` never got the chance to clip, and the inbox dragged the
          document sideways. Flooring the track at zero puts the row back inside the card,
          where the `min-w-0` chain below can do its job. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)]">
        {/* The conversation column. Hidden behind the thread on a phone, always there on
            a desktop, and scrolling on its own so the composer beside it stays put. */}
        <section
          aria-label="Conversations"
          className={cn(
            "min-w-0 overflow-hidden rounded-xl bg-card p-1.5 ring-1 ring-teal/15 lg:max-h-[calc(100dvh-14rem)] lg:overflow-y-auto",
            selected ? "hidden lg:block" : "block",
          )}
        >
          <ThreadList
            threads={visible}
            filter={filter}
            selectedClientId={selected?.clientId}
            now={now}
            pinAction={toggleThreadPinAction}
          />
        </section>

        <section
          aria-label="Conversation"
          className={cn("min-h-0 min-w-0", selected ? "block" : "hidden lg:block")}
        >
          {selected && emptyThread ? (
            <div className="flex min-h-0 flex-col overflow-hidden rounded-xl bg-card ring-1 ring-teal/15 lg:h-[calc(100dvh-14rem)]">
              {/* Reading the thread is what clears the count on the row, on Home, and in
                  Needs Attention — the same mark-read this family's record fires. */}
              <MarkThreadRead
                unread={unreadFromFamily}
                action={markClientMessagesReadAction.bind(null, selected.clientId)}
              />
              <ThreadPaneHeader
                thread={selected}
                filter={filter}
                pinAction={toggleThreadPinAction}
              />
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                <MessageThread
                  messages={messages}
                  viewer="doula"
                  theirName={selected.clientName}
                  now={now}
                  emptyTitle={emptyThread.title}
                  emptyBody={emptyThread.body}
                />
              </div>
              <MessageComposer
                action={sendClientMessageAction}
                hiddenFields={{ clientId: selected.clientId }}
                placeholder={COMPOSER_COPY.staff.placeholder(selected.clientName)}
                hint={COMPOSER_COPY.staff.hint(selected.clientName)}
                submitLabel={COMPOSER_COPY.staff.submitLabel}
                chrome="bare"
              />
            </div>
          ) : (
            <div className="lg:h-[calc(100dvh-14rem)]">
              <ThreadPicker waiting={waiting} />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
