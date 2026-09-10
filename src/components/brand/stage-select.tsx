"use client";

import { useRef, useState } from "react";
import {
  PIPELINE_STAGES,
  STAGE_LABELS,
  stageHint,
  type PipelineStageName,
} from "@/lib/pipeline";
import { Button } from "@/components/ui/button";

/**
 * The stage control (TOK-49).
 *
 * It replaces the one-way advance buttons, which were the loudest piece of feedback on
 * the agency board: click "Start fit" by mistake and there was no way back. A dropdown
 * can move either direction, and a backward move asks first — here in the browser for
 * speed, and again in `setPipelineStage`, which is the check that actually counts.
 *
 * The options come from `PIPELINE_STAGES`; no stage string is written in this file.
 */
export function StageSelect({
  clientId,
  current,
  action,
}: {
  clientId: string;
  current: PipelineStageName;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [choice, setChoice] = useState<PipelineStageName>(current);
  const confirmed = useRef<HTMLInputElement>(null);

  const currentIndex = PIPELINE_STAGES.indexOf(current);
  const isBackward = PIPELINE_STAGES.indexOf(choice) < currentIndex;
  const changed = choice !== current;

  return (
    <form
      action={action}
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        if (!isBackward) return;
        const ok = window.confirm(
          `Move ${STAGE_LABELS[current]} back to ${STAGE_LABELS[choice]}? The record will read as if it never got past this point.`,
        );
        if (!ok) {
          event.preventDefault();
          return;
        }
        if (confirmed.current) confirmed.current.value = "yes";
      }}
    >
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="confirmed" ref={confirmed} value="" readOnly />
      <div className="min-w-[15rem]">
        <label
          htmlFor="stage"
          className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
        >
          Stage
        </label>
        <select
          id="stage"
          name="stage"
          value={choice}
          onChange={(event) => setChoice(event.target.value as PipelineStageName)}
          className="mt-1 h-9 w-full rounded-md border border-teal/20 bg-card px-2.5 text-[13px] text-teal-ink focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/25"
        >
          {PIPELINE_STAGES.map((stage) => (
            <option key={stage} value={stage}>
              {STAGE_LABELS[stage]}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" size="sm" disabled={!changed}>
        {isBackward ? "Move back" : "Update stage"}
      </Button>
      <p className="w-full text-[12.5px] text-muted-foreground">
        {changed && isBackward
          ? "Backward moves are allowed and will ask you to confirm."
          : stageHint(choice)}
      </p>
    </form>
  );
}
