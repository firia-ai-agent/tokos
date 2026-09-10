import Link from "next/link";
import { ArrowLeft, MessageCircle, Pin, PinOff } from "lucide-react";
import { inboxStamp, messageStampFull, previewLine } from "@/lib/messages";
import {
  MESSAGE_INBOX_FILTERS,
  PINNED_INDICATOR_LABEL,
  clientRecordHref,
  countForFilter,
  inboxEmptyState,
  messagesHref,
  pinActionLabel,
  previewSpeaker,
  threadPickerCopy,
  unreadBadgeCopy,
  unreadGlanceLabel,
} from "@/lib/message-inbox";
import type { InboxThread, MessageInboxFilterKey } from "@/lib/message-inbox";
import { cn } from "@/lib/utils";

/**
 * The WhatsApp-shaped staff inbox (TOK-56).
 *
 * The old screen was three sparse cards with "Open thread →" on each, which is a list of
 * links, not a messaging product. This is the list a doula can actually work down: an
 * initials chip, the family, the last line, a short stamp, a coral count when they are
 * waiting, and a pin that floats the family she is on call for to the top.
 *
 * Every string comes from `@/lib/message-inbox`, every colour from a brand token. These
 * are server components — the filters are links and the pin is a server-action form, so
 * the inbox works with no client JavaScript at all.
 */

/* ------------------------------------------------------------ filter strip */

/**
 * All / Unread / Pinned, as real links carrying the open thread along. Each tab prints
 * its own count, so "Unread 0" is visible before it is clicked rather than after.
 */
export function InboxFilterTabs({
  threads,
  active,
  selectedClientId,
}: {
  threads: readonly InboxThread[];
  active: MessageInboxFilterKey;
  selectedClientId?: string | null;
}) {
  return (
    <nav
      aria-label="Filter conversations"
      className="flex flex-wrap items-center gap-1 border-b border-teal/12 pb-2"
    >
      {MESSAGE_INBOX_FILTERS.map((filter) => {
        const current = filter.key === active;
        const count = countForFilter(threads, filter.key);
        return (
          <Link
            key={filter.key}
            href={messagesHref({ filter: filter.key, clientId: selectedClientId })}
            aria-current={current ? "page" : undefined}
            title={filter.description}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors",
              current
                ? "bg-teal text-cloud"
                : "text-teal-ink/70 hover:bg-teal/10 hover:text-teal-ink",
            )}
          >
            {filter.label}
            <span
              className={cn(
                "rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
                current
                  ? "bg-cloud/20 text-cloud"
                  : filter.key === "unread" && count > 0
                    ? "bg-coral/15 text-coral"
                    : "bg-teal/10 text-teal-ink/60",
              )}
            >
              {count}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

/* -------------------------------------------------------------- pin toggle */

/**
 * A one-button form posting the state it was rendered in. Sits above the row's stretched
 * link rather than inside it — a button inside an anchor is neither valid nor clickable.
 */
export function PinToggle({
  thread,
  action,
  className,
}: {
  thread: InboxThread;
  action: (formData: FormData) => void | Promise<void>;
  className?: string;
}) {
  const label = pinActionLabel(thread.pinned, thread.clientName);
  const Icon = thread.pinned ? PinOff : Pin;
  return (
    <form action={action} className={cn("relative z-10 shrink-0", className)}>
      <input type="hidden" name="clientId" value={thread.clientId} />
      <input type="hidden" name="pinned" value={String(thread.pinned)} />
      <button
        type="submit"
        aria-label={label}
        title={label}
        className={cn(
          "flex size-7 items-center justify-center rounded-md transition",
          thread.pinned
            ? "bg-teal/12 text-teal hover:bg-teal/20"
            : "text-teal-ink/25 hover:bg-teal/10 hover:text-teal focus-visible:text-teal",
        )}
      >
        <Icon aria-hidden className="size-3.5" />
      </button>
    </form>
  );
}

/* ------------------------------------------------------------ conversation */

/** One row. Dense on purpose: avatar, name, last line, stamp, count, pin — 60px tall. */
function ThreadRow({
  thread,
  active,
  filter,
  now,
  pinAction,
}: {
  thread: InboxThread;
  active: boolean;
  filter: MessageInboxFilterKey;
  now: Date;
  pinAction: (formData: FormData) => void | Promise<void>;
}) {
  const unread = thread.unreadInbound > 0;
  const speaker = previewSpeaker(thread.lastDirection);
  return (
    <li
      className={cn(
        "relative flex items-center gap-2 rounded-xl px-2 py-2 transition",
        active ? "bg-teal/10 ring-1 ring-teal/25" : "hover:bg-cloud",
      )}
    >
      <Link
        href={messagesHref({ clientId: thread.clientId, filter })}
        aria-label={
          unread
            ? unreadGlanceLabel(thread.clientName, thread.unreadInbound)
            : `Open the thread with ${thread.clientName}`
        }
        className="flex min-w-0 flex-1 items-center gap-3 after:absolute after:inset-0 after:rounded-xl after:content-['']"
      >
        <span
          aria-hidden
          className={cn(
            "relative flex size-10 shrink-0 items-center justify-center rounded-full font-heading text-[14px] font-semibold",
            unread ? "bg-coral/15 text-coral" : "bg-teal/12 text-teal",
          )}
        >
          {thread.initials}
          {/* The glance dot: unread reads before a single word is parsed. */}
          {unread ? (
            <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-coral ring-2 ring-card" />
          ) : null}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span
              className={cn(
                "min-w-0 truncate text-[14.5px]",
                unread ? "font-semibold text-teal-ink" : "font-medium text-teal-ink/90",
              )}
            >
              {thread.clientName}
            </span>
            {thread.pinned ? (
              <Pin
                aria-label={PINNED_INDICATOR_LABEL}
                className="size-3 shrink-0 text-teal/70"
              />
            ) : null}
            <span
              className={cn(
                "ml-auto shrink-0 text-[11.5px] tabular-nums",
                unread ? "font-semibold text-coral" : "text-muted-foreground",
              )}
              title={messageStampFull(thread.lastSentAt)}
            >
              {inboxStamp(thread.lastSentAt, now)}
            </span>
          </span>

          <span className="mt-0.5 flex items-center gap-2">
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-[13px]",
                unread ? "text-teal-ink/80" : "text-muted-foreground",
              )}
            >
              {speaker ? (
                <span className="font-semibold text-teal-ink/60">{speaker}: </span>
              ) : null}
              {previewLine(thread.lastBody, 90)}
            </span>
            {unread ? (
              <span className="shrink-0 rounded-full bg-coral px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-cloud">
                {thread.unreadInbound}
              </span>
            ) : null}
          </span>
        </span>
      </Link>

      <PinToggle thread={thread} action={pinAction} />
    </li>
  );
}

/**
 * The conversation column. Scrolls on its own on desktop so the thread beside it keeps
 * its composer on screen — the two panes never fight over one page scrollbar.
 */
export function ThreadList({
  threads,
  filter,
  selectedClientId,
  now,
  pinAction,
  className,
}: {
  threads: readonly InboxThread[];
  filter: MessageInboxFilterKey;
  selectedClientId?: string | null;
  now: Date;
  pinAction: (formData: FormData) => void | Promise<void>;
  className?: string;
}) {
  if (threads.length === 0) {
    const empty = inboxEmptyState(filter);
    return (
      <div
        className={cn(
          "flex flex-col items-center rounded-xl bg-cloud px-5 py-9 text-center ring-1 ring-teal/15",
          className,
        )}
      >
        <span className="flex size-10 items-center justify-center rounded-full bg-teal/12 text-teal">
          <MessageCircle aria-hidden className="size-5" />
        </span>
        <h2 className="mt-3 font-heading text-[17px] text-teal-ink">{empty.title}</h2>
        <p className="mt-1.5 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
          {empty.body}
        </p>
      </div>
    );
  }

  return (
    <ul className={cn("space-y-0.5", className)}>
      {threads.map((thread) => (
        <ThreadRow
          key={thread.clientId}
          thread={thread}
          active={thread.clientId === selectedClientId}
          filter={filter}
          now={now}
          pinAction={pinAction}
        />
      ))}
    </ul>
  );
}

/* --------------------------------------------------------------- the pane */

/**
 * The head of an open thread: who it is with, the way back to the list on a phone, the
 * pin, and the door to their record — so opening a thread from the inbox never becomes a
 * dead end where the only next step is the browser's back button.
 */
export function ThreadPaneHeader({
  thread,
  filter,
  pinAction,
}: {
  thread: InboxThread;
  filter: MessageInboxFilterKey;
  pinAction: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-teal/12 px-4 py-3">
      <Link
        href={messagesHref({ filter })}
        className="-ml-1 flex size-8 items-center justify-center rounded-lg text-teal transition hover:bg-teal/10 lg:hidden"
        aria-label="Back to all conversations"
      >
        <ArrowLeft aria-hidden className="size-4" />
      </Link>
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-teal/12 font-heading text-[14px] font-semibold text-teal"
      >
        {thread.initials}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate font-heading text-[19px] font-semibold tracking-[-0.01em] text-teal-ink">
          {thread.clientName}
          {thread.pinned ? (
            <Pin aria-label={PINNED_INDICATOR_LABEL} className="size-3.5 shrink-0 text-teal/70" />
          ) : null}
        </p>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">
          {thread.total} message{thread.total === 1 ? "" : "s"}
          {thread.unreadInbound > 0 ? ` · ${unreadBadgeCopy(thread.unreadInbound)}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        <PinToggle thread={thread} action={pinAction} />
        <Link
          href={clientRecordHref(thread.clientId)}
          className="rounded-lg bg-cloud px-2.5 py-1.5 text-[12.5px] font-semibold text-teal ring-1 ring-teal/20 transition hover:ring-teal/45"
        >
          Open record
        </Link>
      </div>
    </header>
  );
}

/**
 * What the right-hand pane shows before a conversation is picked. WhatsApp Web does the
 * same rather than opening someone's thread unasked — and here that matters twice over,
 * because opening a thread is what marks it read.
 */
export function ThreadPicker({ waiting }: { waiting: number }) {
  const copy = threadPickerCopy(waiting);
  return (
    <div className="flex h-full flex-col items-center justify-center rounded-xl bg-cloud px-6 py-16 text-center ring-1 ring-teal/15">
      <span className="flex size-12 items-center justify-center rounded-full bg-teal/12 text-teal">
        <MessageCircle aria-hidden className="size-6" />
      </span>
      <h2 className="mt-3.5 font-heading text-xl text-teal-ink">{copy.title}</h2>
      <p className="mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-muted-foreground">
        {copy.body}
      </p>
    </div>
  );
}
