"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { edgeClass, type MoneyTone } from "@/lib/home-density";
import type { PipelineStageName } from "@/lib/pipeline";
import type {
  PipelineBoardCard,
  PipelineBoardColumn,
  StageMoveOption,
} from "@/lib/pipeline-board";
import { cn } from "@/lib/utils";

/**
 * The pipeline kanban (TOK-72).
 *
 * Two things make this a workspace rather than a poster of one:
 *
 *  - **Every card is reachable.** A column body scrolls; it never truncates. The mock
 *    this is drawn from ends Active Care with "+12 more in active care", which is a
 *    board admitting it is not showing you your own practice. The count in the header is
 *    the whole column, and so is the column.
 *  - **A family can be moved.** Drag a card into another column, or use the Move-to
 *    control on the card — the same `setStageAction` the family record uses, so the
 *    server re-checks every rule either way. Backward moves ask first, here for speed
 *    and again in `setPipelineStage`, which is the check that counts.
 *
 * The options on the control are `card.moves`, computed against this family's own funnel
 * flags, so the dropdown cannot offer a stage the server would refuse. Columns that are
 * not legal targets for the card in your hand go quiet while you drag, rather than
 * accepting the drop and bouncing you to an error.
 *
 * No stage string is written in this file, and no colour: labels arrive worded for the
 * persona, urgency arrives as `edgeClass` from the shared density module.
 *
 * Below `lg` the same board stacks (TOK-76). A kanban is a desktop shape — five columns
 * side by side on a 390px phone is a horizontal scrollbar and a thumb hunting for it — so
 * the columns become full-width sections down the page, each still headed by its stage
 * and its count, and each card still carrying the Move-to control that does the work.
 * Drag stays a desktop affordance; it was never the only way to move a family.
 */

const MONEY_TONE: Record<MoneyTone, string> = {
  coral: "text-coral",
  teal: "text-teal",
  ink: "text-teal-ink",
};

export function PipelineBoard({
  columns,
  action,
}: {
  columns: readonly PipelineBoardColumn[];
  /** `setStageAction`. Passed in so this component owns no server import. */
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [dragged, setDragged] = useState<PipelineBoardCard | null>(null);
  const [overStage, setOverStage] = useState<PipelineStageName | null>(null);

  function move(card: PipelineBoardCard, target: StageMoveOption) {
    if (target.backward) {
      const ok = window.confirm(
        `Move ${card.name} back to ${target.label}? The record will read as if it never got past this point.`,
      );
      if (!ok) return;
    }
    const data = new FormData();
    data.set("clientId", card.id);
    data.set("stage", target.stage);
    // The server refuses a backward move that did not carry the acknowledgement, so the
    // confirm above is an accelerator, never the authority.
    if (target.backward) data.set("confirmed", "yes");
    setDragged(null);
    setOverStage(null);
    startTransition(() => {
      void action(data);
    });
  }

  /** The legal move for the card in hand into this column, if there is one. */
  function dropTarget(stage: PipelineStageName): StageMoveOption | null {
    if (!dragged) return null;
    return dragged.moves.find((option) => option.stage === stage) ?? null;
  }

  return (
    <div
      aria-busy={pending}
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-2.5 pb-2 lg:flex-row lg:overflow-x-auto",
        pending && "opacity-70",
      )}
    >
      {columns.map((column) => {
        const target = dropTarget(column.stage);
        const droppable = Boolean(target);
        const isOver = droppable && overStage === column.stage;
        const isEmpty = column.cards.length === 0;

        return (
          <section
            key={column.stage}
            onDragOver={(event) => {
              if (!droppable) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              setOverStage(column.stage);
            }}
            onDragLeave={() => {
              setOverStage((current) => (current === column.stage ? null : current));
            }}
            onDrop={(event) => {
              if (!dragged || !target) return;
              event.preventDefault();
              move(dragged, target);
            }}
            className={cn(
              "flex w-full flex-col rounded-xl bg-teal/[0.06] ring-1 transition-colors lg:w-[258px] lg:shrink-0",
              isOver ? "bg-teal/[0.12] ring-teal/40" : "ring-teal/10",
              dragged && !droppable && "opacity-45",
            )}
          >
            {/* Header sits outside the scrolling body, so it holds its place while the
                column runs long — the count beside it is the whole group, never "visible". */}
            <header className="flex items-baseline justify-between gap-2 border-b border-teal/10 px-3 py-2.5">
              <h3 className="text-[11px] font-semibold uppercase leading-tight tracking-[0.1em] text-teal-ink">
                {column.label}
              </h3>
              <span className="shrink-0 text-[12px] font-semibold tabular-nums text-teal">
                {column.count}
              </span>
            </header>

            {/* Stacked, the body grows with its cards; as a column it scrolls inside a
                fixed height so the board never grows the page. An empty column earns its
                hint beside full ones — stacked down a phone it is ten paragraphs of
                "nothing here yet", so the header and its zero say it instead. */}
            <div
              className={cn(
                "space-y-2 px-2.5 py-2.5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto",
                isEmpty && "max-lg:hidden",
              )}
            >
              {isEmpty ? (
                <p className="rounded-lg border border-dashed border-teal/20 px-2.5 py-3 text-[11.5px] leading-snug text-muted-foreground">
                  {column.emptyHint}
                </p>
              ) : null}

              {column.cards.map((card) => (
                <article
                  key={card.id}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", card.id);
                    setDragged(card);
                  }}
                  onDragEnd={() => {
                    setDragged(null);
                    setOverStage(null);
                  }}
                  className={cn(
                    "rounded-lg bg-card shadow-sm ring-1 ring-teal/10",
                    edgeClass(card.needsAction),
                  )}
                >
                  {/* The card body is the deep link (Must 6). The move control lives
                      outside it, so there is no interactive element inside the anchor. */}
                  <Link
                    href={card.href}
                    className="block rounded-t-lg px-2.5 pb-1.5 pt-2 hover:bg-cloud/70"
                  >
                    <p className="font-heading text-[14px] font-semibold leading-snug text-teal-ink">
                      {card.name}
                    </p>
                    {card.facts.length > 0 ? (
                      <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">
                        {card.facts.join(" · ")}
                      </p>
                    ) : null}
                    <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 text-[11.5px] leading-snug">
                      {card.money ? (
                        <span className={cn("font-semibold", MONEY_TONE[card.money.tone])}>
                          {card.money.label}
                        </span>
                      ) : null}
                      {card.team ? (
                        <span className="text-muted-foreground">{card.team}</span>
                      ) : null}
                    </p>
                    {card.attention ? (
                      <p className="mt-1 text-[11px] font-semibold leading-snug text-coral">
                        {card.attention}
                      </p>
                    ) : null}
                  </Link>

                  <div className="px-2.5 pb-2 pt-1">
                    <label className="sr-only" htmlFor={`move-${card.id}`}>
                      Move {card.name} to another step
                    </label>
                    <select
                      id={`move-${card.id}`}
                      value=""
                      disabled={card.moves.length === 0 || pending}
                      onChange={(event) => {
                        const option = card.moves.find(
                          (candidate) => candidate.stage === event.target.value,
                        );
                        if (option) move(card, option);
                      }}
                      className="h-7 w-full rounded-md border border-teal/20 bg-card px-1.5 text-[11.5px] font-medium text-teal focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/25 disabled:text-muted-foreground"
                    >
                      <option value="">
                        {card.moves.length === 0 ? "Nowhere to move yet" : "Move to…"}
                      </option>
                      {card.moves.map((option) => (
                        <option key={option.stage} value={option.stage}>
                          {option.backward ? `↩ ${option.label}` : option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
