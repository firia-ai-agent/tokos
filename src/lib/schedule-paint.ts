/**
 * Pure geometry for the availability week grid (TOK-78).
 * Kept free of `@/db` so the client schedule surface can import it.
 */

const DAY_MINUTES = 24 * 60;

/** The grid paints in half-hours, the same step the windows are stored on. */
export const SCHEDULE_STEP_MINUTES = 30;

/** A block a doula paints by tapping once, before dragging it anywhere. */
export const SCHEDULE_DEFAULT_BLOCK_MINUTES = 60;

/** The hours always on screen, so an empty week still reads as a working day. */
export const SCHEDULE_DEFAULT_START_MINUTES = 7 * 60;
export const SCHEDULE_DEFAULT_END_MINUTES = 20 * 60;

export type ScheduleBounds = { startMinutes: number; endMinutes: number };

export function scheduleBounds(
  ranges: readonly { startMinutes: number; endMinutes: number }[],
  fallback: ScheduleBounds = {
    startMinutes: SCHEDULE_DEFAULT_START_MINUTES,
    endMinutes: SCHEDULE_DEFAULT_END_MINUTES,
  },
): ScheduleBounds {
  let start = fallback.startMinutes;
  let end = fallback.endMinutes;
  for (const range of ranges) {
    if (!(range.startMinutes < range.endMinutes)) continue;
    start = Math.min(start, Math.floor(range.startMinutes / 60) * 60);
    end = Math.max(end, Math.ceil(range.endMinutes / 60) * 60);
  }
  return {
    startMinutes: Math.max(0, Math.min(start, DAY_MINUTES - 60)),
    endMinutes: Math.min(DAY_MINUTES, Math.max(end, start + 60)),
  };
}

export function scheduleHourTicks(bounds: ScheduleBounds): number[] {
  const ticks: number[] = [];
  for (let minute = bounds.startMinutes; minute <= bounds.endMinutes; minute += 60) {
    ticks.push(minute);
  }
  return ticks;
}

export function blockPlacement(
  range: { startMinutes: number; endMinutes: number },
  bounds: ScheduleBounds,
): { top: number; height: number } {
  const span = Math.max(1, bounds.endMinutes - bounds.startMinutes);
  const start = Math.max(range.startMinutes, bounds.startMinutes);
  const end = Math.min(range.endMinutes, bounds.endMinutes);
  const top = ((start - bounds.startMinutes) / span) * 100;
  const height = (Math.max(0, end - start) / span) * 100;
  return { top, height };
}

export function minutesAtRatio(
  ratio: number,
  bounds: ScheduleBounds,
  step: number = SCHEDULE_STEP_MINUTES,
): number {
  const span = bounds.endMinutes - bounds.startMinutes;
  const raw = bounds.startMinutes + clamp(ratio, 0, 1) * span;
  const snapped = Math.round(raw / step) * step;
  return clamp(snapped, bounds.startMinutes, bounds.endMinutes);
}

function clamp(value: number, low: number, high: number) {
  return Math.min(high, Math.max(low, value));
}

export function paintedRange(
  anchorMinutes: number,
  pointerMinutes: number,
  bounds: ScheduleBounds,
  step: number = SCHEDULE_STEP_MINUTES,
): { startMinutes: number; endMinutes: number } {
  const low = Math.min(anchorMinutes, pointerMinutes);
  const high = Math.max(anchorMinutes, pointerMinutes);
  if (high - low >= step) {
    return { startMinutes: low, endMinutes: high };
  }
  const length = Math.min(SCHEDULE_DEFAULT_BLOCK_MINUTES, bounds.endMinutes - bounds.startMinutes);
  const startMinutes = clamp(low, bounds.startMinutes, bounds.endMinutes - length);
  return { startMinutes, endMinutes: startMinutes + length };
}

export function nextFreeWindow(
  ranges: readonly { startMinutes: number; endMinutes: number }[],
  bounds: ScheduleBounds,
  length: number = SCHEDULE_DEFAULT_BLOCK_MINUTES,
): { startMinutes: number; endMinutes: number } | null {
  const sorted = [...ranges].sort((a, b) => a.startMinutes - b.startMinutes);
  let cursor = ranges.length === 0 ? bounds.startMinutes : Math.min(bounds.startMinutes, DAY_MINUTES);
  for (const range of sorted) {
    if (range.startMinutes - cursor >= length) {
      return { startMinutes: cursor, endMinutes: cursor + length };
    }
    cursor = Math.max(cursor, range.endMinutes);
  }
  if (DAY_MINUTES - cursor >= length) {
    return { startMinutes: cursor, endMinutes: cursor + length };
  }
  return null;
}
