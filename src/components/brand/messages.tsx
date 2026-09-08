import { MessageCircle, SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { groupByDay, isOwnMessage, messageStamp, messageStampFull } from "@/lib/messages";
import type { ThreadMessage } from "@/lib/messages";
import { cn } from "@/lib/utils";

/**
 * One chat thread, rendered from the same `portal_messages` rows on both sides. The
 * `viewer` decides which side of the thread is "you" — the family writes `inbound`, the
 * doula writes `outbound` — so `/portal/messages` and the client record show the same
 * conversation, mirrored. No SMS: this stays in Tokos.
 */
export type ThreadViewer = "client" | "doula";

export function MessageThread({
  messages,
  viewer,
  theirName,
  now = new Date(),
  emptyTitle,
  emptyBody,
  className,
}: {
  messages: readonly ThreadMessage[];
  viewer: ThreadViewer;
  /** How the other side is named in the sender label. */
  theirName: string;
  now?: Date;
  emptyTitle: string;
  emptyBody: string;
  className?: string;
}) {
  if (messages.length === 0) {
    return <ThreadEmpty title={emptyTitle} body={emptyBody} className={className} />;
  }

  const days = groupByDay(messages, now);

  return (
    <div className={cn("space-y-5", className)}>
      {days.map((day) => (
        <section key={day.key} className="space-y-2.5">
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-teal/15" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {day.label}
            </span>
            <span className="h-px flex-1 bg-teal/15" />
          </div>
          {day.messages.map((message) => {
            const mine = isOwnMessage(message.direction, viewer);
            return (
              <article
                key={message.id}
                className={cn("flex flex-col gap-1", mine ? "items-end" : "items-start")}
              >
                <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {mine ? "You" : theirName}
                </p>
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap sm:max-w-[75%]",
                    mine
                      ? "rounded-br-sm bg-teal-ink text-cloud"
                      : "rounded-bl-sm bg-cloud text-teal-ink ring-1 ring-teal/15",
                  )}
                >
                  {message.body}
                </div>
                <p
                  className="px-1 text-[11px] text-muted-foreground"
                  title={messageStampFull(message.sentAt)}
                >
                  {messageStamp(message.sentAt, now)}
                  {mine && message.readAt ? " · read" : ""}
                </p>
              </article>
            );
          })}
        </section>
      ))}
    </div>
  );
}

/** Not a wireframe: an invitation to start the conversation. */
export function ThreadEmpty({
  title,
  body,
  className,
}: {
  title: string;
  body: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-xl bg-cloud px-6 py-10 text-center ring-1 ring-teal/15",
        className,
      )}
    >
      <span className="flex size-11 items-center justify-center rounded-full bg-teal/12 text-teal">
        <MessageCircle aria-hidden className="size-5" />
      </span>
      <h3 className="mt-3 font-heading text-lg text-teal-ink">{title}</h3>
      <p className="mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

/**
 * The composer sits against the bottom of the thread and sticks there while the
 * conversation scrolls, so replying never means scrolling back down.
 */
export function MessageComposer({
  action,
  placeholder,
  submitLabel = "Send",
  hint,
  hiddenFields,
  className,
}: {
  action: (formData: FormData) => void | Promise<void>;
  placeholder: string;
  submitLabel?: string;
  hint?: string;
  hiddenFields?: Record<string, string>;
  className?: string;
}) {
  return (
    <form
      action={action}
      className={cn(
        "sticky bottom-0 z-10 space-y-2 rounded-xl bg-card/95 p-3 ring-1 ring-teal/15 backdrop-blur supports-[backdrop-filter]:bg-card/80",
        className,
      )}
    >
      {Object.entries(hiddenFields ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Textarea
        name="body"
        required
        rows={3}
        placeholder={placeholder}
        className="resize-none bg-background"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11.5px] text-muted-foreground">
          {hint ?? "Stays in Tokos. No texts, no email thread."}
        </p>
        <Button type="submit" size="sm" className="gap-1.5">
          <SendHorizontal aria-hidden className="size-4" />
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
