import { SYSTEM_ACTOR, type StageLog } from "@/lib/stage-log";

/**
 * The stage history behind a family record (TOK-77).
 *
 * Collapsed by default, and that is the design rather than a shortcut: the stepper and
 * the one-line story above already answer "where are we" and "what moved last". This is
 * the audit trail behind them, and an audit trail that is always open costs density on
 * every visit for the sake of the rare one that needs it.
 *
 * When it *is* open, every row carries the three things the old list omitted — who moved
 * the family, why, and when. Seed rows never appear as facts; they are admitted to in one
 * quiet line at the bottom, because pretending they do not exist is its own kind of lie.
 */
export function StageLogPanel({ log }: { log: StageLog }) {
  if (log.entries.length === 0) {
    return (
      <p className="text-[12.5px] text-muted-foreground">
        {log.noiseNote ?? "No moves yet — nothing has been logged on this record."}
      </p>
    );
  }

  return (
    <details className="group">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-[12.5px] font-semibold text-teal hover:underline">
        <span aria-hidden className="text-[10px] transition-transform group-open:rotate-90">
          ▶
        </span>
        {log.summary}
      </summary>

      <ol className="mt-2 space-y-1.5">
        {log.entries.map((entry) => (
          <li
            key={entry.id}
            className="rounded-lg bg-cloud px-2.5 py-1.5 text-[12.5px] leading-snug ring-1 ring-teal/12"
          >
            <p className="text-teal-ink">
              <span className="font-semibold">{entry.actor ?? SYSTEM_ACTOR}</span>
              <span className="text-muted-foreground"> · </span>
              {entry.reason ?? entry.to}
              <span className="text-muted-foreground"> · </span>
              <time dateTime={entry.at.toISOString()} title={entry.whenFull} className="text-muted-foreground">
                {entry.when}
              </time>
            </p>
            <p className="text-[11.5px] text-muted-foreground">
              {entry.from ? `${entry.from} → ` : ""}
              {entry.to}
            </p>
          </li>
        ))}
      </ol>

      {log.noiseNote ? (
        <p className="mt-1.5 text-[11.5px] text-muted-foreground">{log.noiseNote}</p>
      ) : null}
    </details>
  );
}
