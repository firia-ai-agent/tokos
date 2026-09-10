import Link from "next/link";
import { cn } from "@/lib/utils";
import { WEEKDAY_HEADINGS, type CalendarDay, type CalendarGrid } from "@/lib/calendar-grid";

/**
 * The Faith-styled month grid both calendars draw on (TOK-54).
 *
 * No scheduler library: a month is seven columns and a handful of rules about which
 * cell a day lands in, and `lib/calendar-grid` already owns those. What is left is
 * brand — Teal column headings, Cloud on the days that belong to the next month,
 * Coral around today — so the doula's grid and the family's grid cannot drift apart.
 *
 * `renderDay` stays a plain function because both callers are server components: the
 * cells render on the server with the visits already in them, and the whole calendar
 * ships without a kilobyte of client JavaScript.
 */

export function CalendarFrame({
  label,
  sublabel,
  prevHref,
  nextHref,
  todayHref,
  actions,
  children,
}: {
  label: string;
  sublabel?: string;
  prevHref: string;
  nextHref: string;
  todayHref: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <ArrowLink href={prevHref} label="Previous" glyph="‹" />
            <ArrowLink href={nextHref} label="Next" glyph="›" />
          </div>
          <div>
            <h3 className="font-heading text-[19px] leading-tight text-teal-ink">{label}</h3>
            {sublabel ? (
              <p className="text-[11.5px] leading-tight text-muted-foreground">{sublabel}</p>
            ) : null}
          </div>
          <Link
            href={todayHref}
            className="ml-1 rounded-md px-2 py-1 text-[11.5px] font-semibold text-teal ring-1 ring-teal/20 transition-colors hover:bg-teal/10"
          >
            Today
          </Link>
        </div>
        {actions ? <div className="flex items-center gap-1.5">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

function ArrowLink({ href, label, glyph }: { href: string; label: string; glyph: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="flex size-7 items-center justify-center rounded-md text-[16px] leading-none text-teal-ink/70 ring-1 ring-teal/15 transition-colors hover:bg-teal/10 hover:text-teal-ink"
    >
      {glyph}
    </Link>
  );
}

export function MonthGrid({
  grid,
  renderDay,
  compact = false,
}: {
  grid: CalendarGrid;
  renderDay: (day: CalendarDay) => React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-xl bg-card ring-1 ring-teal/15">
      <div className="grid grid-cols-7 bg-teal">
        {WEEKDAY_HEADINGS.map((heading) => (
          <div
            key={heading}
            className="px-2 py-1.5 text-center text-[10.5px] font-semibold uppercase tracking-[0.14em] text-cloud/85"
          >
            {heading}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {grid.days.map((day) => (
          <DayCell key={day.key} day={day} compact={compact}>
            {renderDay(day)}
          </DayCell>
        ))}
      </div>
    </div>
  );
}

function DayCell({
  day,
  compact,
  children,
}: {
  day: CalendarDay;
  compact: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col gap-1 border-t border-l border-teal/10 p-1.5 first:border-l-0 [&:nth-child(7n+1)]:border-l-0",
        compact ? "min-h-[76px]" : "min-h-[112px]",
        // The days either side of the month stay legible but recede — a family looking
        // for the 1st should still find it in the last row.
        day.inMonth ? "bg-card" : "bg-cloud/70",
        day.isToday && "ring-2 ring-inset ring-coral/70",
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "text-[12px] font-semibold tabular-nums",
            day.isToday
              ? "rounded-full bg-coral px-1.5 py-0.5 text-[11px] leading-none text-white"
              : day.inMonth
                ? day.isPast
                  ? "text-teal-ink/45"
                  : "text-teal-ink"
                : "text-teal-ink/30",
          )}
        >
          {day.day}
        </span>
      </div>
      {children}
    </div>
  );
}

/** One booked thing on a day cell. Time first — that is what a doula scans for. */
export function DayChip({
  time,
  label,
  href,
  tone = "teal",
}: {
  time?: string;
  label: string;
  href?: string;
  tone?: "teal" | "coral" | "ink";
}) {
  const body = (
    <span className="block truncate">
      {time ? <span className="font-semibold tabular-nums">{time}</span> : null}
      {time ? " " : null}
      {label}
    </span>
  );
  const className = cn(
    "block rounded-md px-1.5 py-1 text-[11px] leading-tight transition-colors",
    tone === "teal" && "bg-teal/12 text-teal-ink hover:bg-teal/20",
    tone === "coral" && "bg-coral/15 text-[#8A3116] hover:bg-coral/25",
    tone === "ink" && "bg-teal-ink/8 text-teal-ink/75",
  );
  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <span className={className}>{body}</span>
  );
}
