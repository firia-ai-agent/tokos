import { format } from "date-fns";
import { PIPELINE_STAGES, STAGE_LABELS, type PipelineStageName } from "@/lib/pipeline";
import { cn } from "@/lib/utils";

/**
 * Stage history as the full pipeline, not a log (TOK-49).
 *
 * What used to render here was `fit → agreement_signed · seed` — accurate, and unreadable
 * unless you already knew the funnel. This shows every stage in order with the date the
 * record entered it, so "where are we and how long has that been true" is one glance
 * rather than a reconstruction.
 *
 * It is fed entirely from `PIPELINE_STAGES` / `STAGE_LABELS`, so adding a stage adds a
 * step here with no edit to this file.
 */
export function StageStepper({
  current,
  entered,
  className,
}: {
  current: PipelineStageName;
  /** Stage → first time the record entered it. From `stageHistory`. */
  entered: Map<PipelineStageName, Date>;
  className?: string;
}) {
  const currentIndex = PIPELINE_STAGES.indexOf(current);

  return (
    <ol
      className={cn("flex gap-1 overflow-x-auto pb-1", className)}
      aria-label="Pipeline stage history"
    >
      {PIPELINE_STAGES.map((stage, index) => {
        const at = entered.get(stage);
        const isCurrent = index === currentIndex;
        // Reached, but not where the record sits now. A stage entered and later stepped
        // back out of still reads as reached — it happened.
        const isDone = index < currentIndex || (Boolean(at) && !isCurrent);
        return (
          <li
            key={stage}
            aria-current={isCurrent ? "step" : undefined}
            className={cn(
              "min-w-[7.5rem] flex-1 rounded-lg border-t-[3px] px-2.5 py-2",
              isCurrent
                ? "border-t-coral bg-coral/10"
                : isDone
                  ? "border-t-teal bg-teal/8"
                  : "border-t-teal/15 bg-cloud",
            )}
          >
            <p
              className={cn(
                "text-[11px] font-semibold uppercase leading-[14px] tracking-[0.06em]",
                isCurrent ? "text-coral" : isDone ? "text-teal-ink" : "text-muted-foreground",
              )}
            >
              {STAGE_LABELS[stage]}
            </p>
            <p className="mt-1 text-[11.5px] tabular-nums text-muted-foreground">
              {at ? format(at, "MMM d") : "—"}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
