"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  WEEKDAY_NAMES,
  WEEKDAY_SHORT_NAMES,
  WEEK_COLUMN_WEEKDAYS,
  dayWindowMinutes,
  formatDuration,
  formatMinutesCompact,
  formatWindowRange,
  halfHourOptions,
  mergeDayWindows,
  summarizeDayWindows,
  windowsByWeekday,
  type MinuteRange,
  type WeekWindow,
} from "@/lib/availability-windows";
import {
  SCHEDULE_STEP_MINUTES,
  blockPlacement,
  minutesAtRatio,
  nextFreeWindow,
  paintedRange,
  scheduleBounds,
  scheduleHourTicks,
} from "@/lib/schedule-paint";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The weekly schedule grid (TOK-78).
 *
 * Availability used to be seven rows of From→To — one continuous window per weekday, and
 * no way to say "10 to 12, then back at 2". A doula with a noon prenatal visit had two
 * options, both wrong: publish hours she could not keep, or close the afternoon.
 *
 * So the editor is a schedule, the way Cal.com and Google draw one. Hours run down, the
 * week runs across, and an open window is a **block you paint**: press on a column and
 * drag, and the range under your finger becomes bookable. Drag a block to move it, drag
 * its edges to resize, press it to select it. A midday gap is not a setting — it is the
 * empty grid between two blocks, which is exactly what a family will see on the book page.
 *
 * The blocks are the whole state. There is no "enabled" checkbox holding an opinion the
 * rows disagree with: a day with no blocks is a closed day, and the header switch simply
 * clears the column (remembering it, so a mis-tap is one tap back).
 *
 * Everything the grid knows about arithmetic — where a block sits, which half-hour a
 * pointer is over, where the next free window starts — comes from `lib/calendar-grid`,
 * and everything it knows about what a window *is* comes from `lib/calendar`. This file
 * owns pointers and brand. The server re-validates the whole week on save regardless:
 * merging overlaps here is a courtesy to the doula, never the authority.
 */

/** Tall enough to press accurately, short enough that a 13-hour day fits on a laptop. */
const HOUR_PX = 34;

const DAY_END_MINUTES = 24 * 60;

const START_OPTIONS = halfHourOptions(0, 23 * 60 + 30);
const END_OPTIONS = halfHourOptions(30, 24 * 60);

type Block = MinuteRange & { id: number };
type DayBlocks = Record<number, Block[]>;

type Drag =
  | { kind: "paint"; weekday: number; anchor: number; id: number }
  | { kind: "move"; weekday: number; id: number; grabOffset: number; length: number }
  | { kind: "resize"; weekday: number; id: number; edge: "start" | "end"; pinned: number };

type Selection = { weekday: number; id: number } | null;

let blockSeq = 0;
const nextId = () => (blockSeq += 1);

function toBlocks(windows: readonly WeekWindow[]): DayBlocks {
  const byDay = windowsByWeekday(windows);
  const days: DayBlocks = {};
  for (const weekday of WEEK_COLUMN_WEEKDAYS) {
    days[weekday] = (byDay.get(weekday) ?? []).map((range) => ({ ...range, id: nextId() }));
  }
  return days;
}

function toWindows(days: DayBlocks): WeekWindow[] {
  return WEEK_COLUMN_WEEKDAYS.flatMap((weekday) =>
    (days[weekday] ?? []).map((block) => ({
      weekday,
      startMinutes: block.startMinutes,
      endMinutes: block.endMinutes,
    })),
  );
}

/**
 * Merge a range into a day. Blocks that survive untouched keep their identity, and so
 * does the one the range landed in — a resize that swallows its neighbour leaves the
 * selection on the block still under the cursor rather than closing the fine-tune row.
 */
function withRange(blocks: readonly Block[], range: MinuteRange, id: number): Block[] {
  return mergeDayWindows([...blocks, range]).map((merged) => {
    if (merged.startMinutes <= range.startMinutes && merged.endMinutes >= range.endMinutes) {
      return { ...merged, id };
    }
    const kept = blocks.find(
      (block) =>
        block.startMinutes === merged.startMinutes && block.endMinutes === merged.endMinutes,
    );
    return kept ?? { ...merged, id: nextId() };
  });
}

export function AvailabilityWeekGrid({
  windows,
  zoneLabel,
  action,
}: {
  windows: readonly WeekWindow[];
  /** "America/New_York (EDT)" — whose clock these blocks are on. */
  zoneLabel: string;
  /** `saveAvailabilityAction`. Passed in so this component owns no server import. */
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [days, setDays] = useState<DayBlocks>(() => toBlocks(windows));
  const [drag, setDrag] = useState<Drag | null>(null);
  const [draft, setDraft] = useState<(MinuteRange & { weekday: number }) | null>(null);
  const [selected, setSelected] = useState<Selection>(null);
  const columns = useRef<Record<number, HTMLDivElement | null>>({});
  // What a day held before its switch was turned off.
  const remembered = useRef<Record<number, Block[]>>({});
  // pointerup reads the live range from here; state would be a frame behind.
  const draftRef = useRef<(MinuteRange & { weekday: number }) | null>(null);

  const bounds = useMemo(
    () => scheduleBounds(WEEK_COLUMN_WEEKDAYS.flatMap((weekday) => days[weekday] ?? [])),
    [days],
  );
  const ticks = useMemo(() => scheduleHourTicks(bounds), [bounds]);
  const gridHeight = ((bounds.endMinutes - bounds.startMinutes) / 60) * HOUR_PX;
  const serialized = useMemo(() => JSON.stringify(toWindows(days)), [days]);
  // Both sides run through the same sort, so "different from what is saved" is an exact
  // compare rather than a flag a no-op drag could set.
  const saved = useMemo(() => JSON.stringify(toWindows(toBlocks(windows))), [windows]);
  const dirty = serialized !== saved;
  const totalMinutes = WEEK_COLUMN_WEEKDAYS.reduce<number>(
    (total, weekday) => total + dayWindowMinutes(days[weekday] ?? []),
    0,
  );

  const minutesAt = useCallback(
    (weekday: number, clientY: number) => {
      const element = columns.current[weekday];
      if (!element) return bounds.startMinutes;
      const rect = element.getBoundingClientRect();
      return minutesAtRatio((clientY - rect.top) / rect.height, bounds);
    },
    [bounds],
  );

  const paint = useCallback((next: (MinuteRange & { weekday: number }) | null) => {
    draftRef.current = next;
    setDraft(next);
  }, []);

  /* ---- pointer painting -------------------------------------------------- */

  function startPaint(event: React.PointerEvent<HTMLDivElement>, weekday: number) {
    if (event.button !== 0) return;
    event.preventDefault();
    const anchor = minutesAt(weekday, event.clientY);
    // A press with no drag still opens a window — click-to-paint is the whole gesture on
    // a phone, where there is no comfortable drag.
    setDrag({ kind: "paint", weekday, anchor, id: nextId() });
    paint({ weekday, ...paintedRange(anchor, anchor, bounds) });
  }

  /** Lift a block out of the day and into the draft — move and resize share the path. */
  function liftBlock(
    event: React.PointerEvent<HTMLElement>,
    weekday: number,
    block: Block,
    mode: "move" | "start" | "end",
  ) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const pointer = minutesAt(weekday, event.clientY);
    setSelected({ weekday, id: block.id });
    setDays((current) => ({
      ...current,
      [weekday]: (current[weekday] ?? []).filter((item) => item.id !== block.id),
    }));
    paint({ weekday, startMinutes: block.startMinutes, endMinutes: block.endMinutes });
    if (mode === "move") {
      setDrag({
        kind: "move",
        weekday,
        id: block.id,
        grabOffset: pointer - block.startMinutes,
        length: block.endMinutes - block.startMinutes,
      });
    } else {
      setDrag({
        kind: "resize",
        weekday,
        id: block.id,
        edge: mode,
        pinned: mode === "start" ? block.endMinutes : block.startMinutes,
      });
    }
  }

  useEffect(() => {
    if (!drag) return;

    const onMove = (event: PointerEvent) => {
      const pointer = minutesAt(drag.weekday, event.clientY);
      if (drag.kind === "paint") {
        paint({ weekday: drag.weekday, ...paintedRange(drag.anchor, pointer, bounds) });
        return;
      }
      if (drag.kind === "move") {
        const start = Math.min(
          Math.max(pointer - drag.grabOffset, bounds.startMinutes),
          bounds.endMinutes - drag.length,
        );
        paint({ weekday: drag.weekday, startMinutes: start, endMinutes: start + drag.length });
        return;
      }
      const low = Math.min(drag.pinned, pointer);
      const high = Math.max(drag.pinned, pointer);
      paint({
        weekday: drag.weekday,
        startMinutes: low,
        endMinutes: Math.max(high, low + SCHEDULE_STEP_MINUTES),
      });
    };

    const onUp = () => {
      const pending = draftRef.current;
      setDrag(null);
      paint(null);
      if (!pending) return;
      const { weekday, ...range } = pending;
      setDays((current) => ({
        ...current,
        [weekday]: withRange(current[weekday] ?? [], range, drag.id),
      }));
      // The block you just drew is the one you are working on: it opens the fine-tune row
      // rather than making you hunt for it again.
      setSelected({ weekday, id: drag.id });
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [drag, bounds, minutesAt, paint]);

  /* ---- block edits ------------------------------------------------------- */

  const removeBlock = useCallback((weekday: number, id: number) => {
    setDays((current) => ({
      ...current,
      [weekday]: (current[weekday] ?? []).filter((block) => block.id !== id),
    }));
    setSelected(null);
  }, []);

  /** Move or stretch a block by whole half-hours — the keyboard path onto the grid. */
  const nudge = useCallback((weekday: number, id: number, deltaStart: number, deltaEnd: number) => {
    setDays((current) => {
      const blocks = current[weekday] ?? [];
      const block = blocks.find((item) => item.id === id);
      if (!block) return current;
      const startMinutes = Math.max(
        0,
        Math.min(block.startMinutes + deltaStart, DAY_END_MINUTES - SCHEDULE_STEP_MINUTES),
      );
      const endMinutes = Math.min(
        DAY_END_MINUTES,
        Math.max(block.endMinutes + deltaEnd, startMinutes + SCHEDULE_STEP_MINUTES),
      );
      const rest = blocks.filter((item) => item.id !== id);
      return { ...current, [weekday]: withRange(rest, { startMinutes, endMinutes }, id) };
    });
  }, []);

  const retime = useCallback((weekday: number, id: number, patch: Partial<MinuteRange>) => {
    setDays((current) => {
      const blocks = current[weekday] ?? [];
      const block = blocks.find((item) => item.id === id);
      if (!block) return current;
      const startMinutes = patch.startMinutes ?? block.startMinutes;
      const endMinutes = patch.endMinutes ?? block.endMinutes;
      // The two selects move independently, so the invalid half of a two-step edit is
      // ignored rather than saved inverted.
      if (startMinutes >= endMinutes) return current;
      const rest = blocks.filter((item) => item.id !== id);
      return { ...current, [weekday]: withRange(rest, { startMinutes, endMinutes }, id) };
    });
  }, []);

  function addWindow(weekday: number) {
    const range = nextFreeWindow(days[weekday] ?? [], bounds);
    if (!range) return;
    const id = nextId();
    setDays((current) => ({ ...current, [weekday]: withRange(current[weekday] ?? [], range, id) }));
    setSelected({ weekday, id });
  }

  function toggleDay(weekday: number, open: boolean) {
    if (!open) {
      remembered.current[weekday] = days[weekday] ?? [];
      setDays((current) => ({ ...current, [weekday]: [] }));
      setSelected(null);
      return;
    }
    // Reopening a day gives back the windows it had, so an accidental tap on the switch
    // costs one tap, not a repaint.
    const restored = remembered.current[weekday];
    if (restored?.length) {
      setDays((current) => ({ ...current, [weekday]: restored }));
      return;
    }
    const range = nextFreeWindow([], bounds);
    if (!range) return;
    const id = nextId();
    setDays((current) => ({ ...current, [weekday]: [{ ...range, id }] }));
    setSelected({ weekday, id });
  }

  const selectedBlock = selected
    ? (days[selected.weekday] ?? []).find((block) => block.id === selected.id) ?? null
    : null;

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="windows" value={serialized} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-muted-foreground">
          Drag on a day to open a window. Drag a block to move it, its edges to resize,
          press it to fine-tune. Empty grid is time nobody can book.
        </p>
        <span className="rounded-md bg-cloud px-2 py-1 text-[11px] font-semibold text-teal-ink/70 ring-1 ring-teal/12">
          {totalMinutes > 0 ? `${formatDuration(totalMinutes)} open a week` : "Nothing open yet"}
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-teal/12">
        <div className="min-w-[620px] p-2">
          <div className="grid grid-cols-[48px_repeat(7,minmax(0,1fr))] gap-1">
            <div aria-hidden />
            {WEEK_COLUMN_WEEKDAYS.map((weekday) => {
              const blocks = days[weekday] ?? [];
              const open = blocks.length > 0;
              return (
                <div key={weekday} className="pb-1 text-center">
                  <label className="flex items-center justify-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-teal">
                    <input
                      type="checkbox"
                      checked={open}
                      onChange={(event) => toggleDay(weekday, event.target.checked)}
                      aria-label={`${WEEKDAY_NAMES[weekday]} open`}
                      className="size-3.5 accent-teal"
                    />
                    {WEEKDAY_SHORT_NAMES[weekday]}
                  </label>
                  <p
                    className={cn(
                      "mt-0.5 truncate text-[10.5px] tabular-nums",
                      open ? "text-teal-ink/70" : "text-teal-ink/35",
                    )}
                    title={open ? summarizeDayWindows(blocks) : "Closed"}
                  >
                    {open ? summarizeDayWindows(blocks) : "Closed"}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-[48px_repeat(7,minmax(0,1fr))] gap-1">
            {/* Hour gutter. The labels sit on the lines, not between them. */}
            <div className="relative" style={{ height: gridHeight }}>
              {ticks.slice(0, -1).map((tick) => (
                <span
                  key={tick}
                  className="absolute right-1 -translate-y-1/2 text-[10px] tabular-nums text-teal-ink/40"
                  style={{
                    top: `${((tick - bounds.startMinutes) / (bounds.endMinutes - bounds.startMinutes)) * 100}%`,
                  }}
                >
                  {formatMinutesCompact(tick)}
                </span>
              ))}
            </div>

            {WEEK_COLUMN_WEEKDAYS.map((weekday) => {
              const blocks = days[weekday] ?? [];
              const painting = draft?.weekday === weekday ? draft : null;
              return (
                <div
                  key={weekday}
                  ref={(node) => {
                    columns.current[weekday] = node;
                  }}
                  onPointerDown={(event) => startPaint(event, weekday)}
                  role="presentation"
                  className={cn(
                    "relative touch-none select-none rounded-lg ring-1 transition-colors",
                    blocks.length > 0 ? "bg-cloud/60 ring-teal/12" : "bg-cloud/30 ring-teal/8",
                    drag?.weekday === weekday && "ring-teal/35",
                  )}
                  style={{ height: gridHeight }}
                >
                  {/* Hour lines. Half-hours stay implied — the grid reads as hours and
                      snaps to halves, which is how a schedule is scanned. */}
                  {ticks.slice(1, -1).map((tick) => (
                    <span
                      key={tick}
                      className="pointer-events-none absolute inset-x-0 border-t border-teal/8"
                      style={{
                        top: `${((tick - bounds.startMinutes) / (bounds.endMinutes - bounds.startMinutes)) * 100}%`,
                      }}
                    />
                  ))}

                  {blocks.map((block) => {
                    const place = blockPlacement(block, bounds);
                    const isSelected = selected?.weekday === weekday && selected.id === block.id;
                    const tall = block.endMinutes - block.startMinutes >= 60;
                    return (
                      <div
                        key={block.id}
                        className={cn(
                          "absolute inset-x-0.5 overflow-hidden rounded-md bg-teal text-cloud shadow-sm transition-shadow",
                          isSelected && "ring-2 ring-coral ring-offset-1 ring-offset-card",
                        )}
                        style={{ top: `${place.top}%`, height: `${place.height}%` }}
                      >
                        <button
                          type="button"
                          onPointerDown={(event) => liftBlock(event, weekday, block, "move")}
                          onClick={() => setSelected({ weekday, id: block.id })}
                          onKeyDown={(event) => {
                            if (event.key === "Backspace" || event.key === "Delete") {
                              event.preventDefault();
                              removeBlock(weekday, block.id);
                            } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                              event.preventDefault();
                              const step =
                                event.key === "ArrowUp" ? -SCHEDULE_STEP_MINUTES : SCHEDULE_STEP_MINUTES;
                              // Shift stretches the window; on its own the whole block walks.
                              nudge(weekday, block.id, event.shiftKey ? 0 : step, step);
                            }
                          }}
                          aria-label={`${WEEKDAY_NAMES[weekday]} ${formatWindowRange(block.startMinutes, block.endMinutes)}. Arrow keys move, shift-arrow resizes, delete removes.`}
                          className="size-full cursor-grab px-1.5 py-0.5 text-left leading-tight outline-none focus-visible:ring-2 focus-visible:ring-coral active:cursor-grabbing"
                        >
                          <span className="block truncate text-[10.5px] font-semibold tabular-nums">
                            {formatMinutesCompact(block.startMinutes)}–
                            {formatMinutesCompact(block.endMinutes)}
                          </span>
                          {tall ? (
                            <span className="block truncate text-[9.5px] text-cloud/70">Open</span>
                          ) : null}
                        </button>
                        <span
                          onPointerDown={(event) => liftBlock(event, weekday, block, "start")}
                          role="presentation"
                          className="absolute inset-x-0 top-0 h-1.5 cursor-ns-resize"
                        />
                        <span
                          onPointerDown={(event) => liftBlock(event, weekday, block, "end")}
                          role="presentation"
                          className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize"
                        />
                      </div>
                    );
                  })}

                  {painting ? (
                    <div
                      className="pointer-events-none absolute inset-x-0.5 rounded-md bg-teal/70 px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums text-cloud ring-2 ring-coral/70"
                      style={{
                        top: `${blockPlacement(painting, bounds).top}%`,
                        height: `${blockPlacement(painting, bounds).height}%`,
                      }}
                    >
                      {formatMinutesCompact(painting.startMinutes)}–
                      {formatMinutesCompact(painting.endMinutes)}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="mt-1 grid grid-cols-[48px_repeat(7,minmax(0,1fr))] gap-1">
            <div aria-hidden />
            {WEEK_COLUMN_WEEKDAYS.map((weekday) => (
              <button
                key={weekday}
                type="button"
                onClick={() => addWindow(weekday)}
                className="rounded-md py-1 text-[10.5px] font-semibold text-teal transition-colors hover:bg-teal/10"
              >
                + Add window
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Precision beside the paint, never instead of it: the grid says where the day
          has holes, this says 9:30 rather than 9:15-ish. */}
      {selectedBlock && selected ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-cloud px-3 py-2 ring-1 ring-teal/12">
          <span className="text-[12px] font-semibold text-teal-ink">
            {WEEKDAY_NAMES[selected.weekday]}
          </span>
          <select
            value={selectedBlock.startMinutes}
            onChange={(event) =>
              retime(selected.weekday, selected.id, { startMinutes: Number(event.target.value) })
            }
            aria-label="Window opens at"
            className="h-8 rounded-lg border border-input bg-card px-2 text-[12.5px] tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {START_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="text-[12.5px] text-muted-foreground">to</span>
          <select
            value={selectedBlock.endMinutes}
            onChange={(event) =>
              retime(selected.weekday, selected.id, { endMinutes: Number(event.target.value) })
            }
            aria-label="Window closes at"
            className="h-8 rounded-lg border border-input bg-card px-2 text-[12.5px] tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {END_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="text-[12px] text-muted-foreground">
            {formatDuration(selectedBlock.endMinutes - selectedBlock.startMinutes)}
          </span>
          <button
            type="button"
            onClick={() => removeBlock(selected.weekday, selected.id)}
            className="ml-auto rounded-md px-2 py-1 text-[12px] font-semibold text-coral ring-1 ring-coral/25 transition-colors hover:bg-coral/10"
          >
            Remove window
          </button>
        </div>
      ) : (
        <p className="text-[12px] text-muted-foreground">
          Times are your practice&rsquo;s clock — {zoneLabel}. Press a block to fine-tune it
          to the half-hour.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit">Save windows</Button>
        {dirty ? (
          <span className="text-[12px] font-semibold text-coral">
            Unsaved changes — families still see your last saved week.
          </span>
        ) : null}
      </div>
    </form>
  );
}
