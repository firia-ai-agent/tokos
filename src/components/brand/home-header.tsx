import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { QueueLink } from "@/lib/home-queues";

/**
 * The band both Homes open on (TOK-52).
 *
 * Two things moved. The date used to sit in a grey subline with the queue count glued to
 * it — "Thursday, September 10 · 9 things waiting for you" — so the one line a person is
 * meant to act on was wearing the same clothes as the calendar. Now the date is a quiet
 * teal line at the top of the band, and the count is a Cloud inset you can click into the
 * board it counts.
 *
 * White page, Cloud inset, no wash: the greeting is still the loudest thing here.
 */
export function HomeHeader({
  dateLabel,
  eyebrow,
  title,
  queue,
  quiet,
  action,
}: {
  /** "Thursday, September 10" — top of the band. */
  dateLabel: string;
  /** The practice, when the surface is the family's. */
  eyebrow?: string | null;
  title: string;
  /** The summary and the board it opens; null when there is nothing waiting. */
  queue?: QueueLink | null;
  /** What the band says when the queue is empty. */
  quiet: string;
  /** The header call to action — "Open pipeline" / "Open clients". */
  action?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-teal">
          {dateLabel}
          {eyebrow ? <span className="text-teal/60"> · {eyebrow}</span> : null}
        </p>
        <h1 className="mt-1 font-heading text-[28px] font-semibold leading-tight tracking-[-0.02em] text-teal-ink sm:text-[32px]">
          {title}
        </h1>
        {queue ? (
          <Link
            href={queue.href}
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-cloud px-3 py-1.5 text-[14px] font-semibold text-coral ring-1 ring-coral/25 transition hover:ring-coral/55"
          >
            {queue.label}
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        ) : (
          <p className="mt-2 text-[14.5px] leading-relaxed text-muted-foreground">{quiet}</p>
        )}
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </header>
  );
}
