import {
  VISIBLE_SLOT_COUNT,
  formatSlotTime,
  groupByDay,
  splitSlots,
  timezoneLabel,
  type DayGroup,
  type Slot,
} from "@/lib/calendar";

/**
 * The booking picker every surface shares (TOK-33 C1/C12).
 *
 * The old UI was one flat radio list: fourteen days of hours with no day, no zone and
 * no end in sight. Here the same slots are grouped into day cards of tappable chips,
 * only the first few are on screen, and the rest sit behind a native `<details>` — no
 * client component, so the whole page stays a server render.
 *
 * Only the first radio carries `required`: HTML makes a radio *group* required when any
 * member is, and putting it on a collapsed option would ask the browser to focus
 * something nobody can see.
 */

function slotValue(slot: Slot) {
  return `${slot.startsAt.toISOString()}|${slot.endsAt.toISOString()}`;
}

function DayCards({
  groups,
  name,
  timeZone,
  firstRequired,
}: {
  groups: DayGroup<Slot>[];
  name: string;
  timeZone: string;
  firstRequired: boolean;
}) {
  return (
    <div className="space-y-3">
      {groups.map((group, groupIndex) => (
        <div key={group.key} className="rounded-xl border border-input/60 bg-card/50 p-3">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-teal">
            {group.label}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {group.items.map((slot, slotIndex) => (
              <label key={slot.startsAt.toISOString()} className="cursor-pointer">
                <input
                  type="radio"
                  name={name}
                  value={slotValue(slot)}
                  required={firstRequired && groupIndex === 0 && slotIndex === 0}
                  className="peer sr-only"
                />
                <span className="inline-block rounded-full border border-input px-3 py-1.5 text-sm transition-colors peer-checked:border-teal peer-checked:bg-teal peer-checked:text-white peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50">
                  {formatSlotTime(slot.startsAt, timeZone)}
                </span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function SlotPicker({
  slots,
  timeZone,
  now = new Date(),
  name = "slot",
  visibleCount = VISIBLE_SLOT_COUNT,
  legend = "Open times",
}: {
  slots: Slot[];
  timeZone: string;
  now?: Date;
  name?: string;
  visibleCount?: number;
  legend?: string;
}) {
  if (slots.length === 0) return null;
  const { visible, more } = splitSlots(slots, visibleCount);
  const zone = timezoneLabel(slots[0].startsAt, timeZone);

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">{legend}</legend>
      <p className="text-xs text-muted-foreground">All times {zone}.</p>
      <DayCards groups={groupByDay(visible, timeZone, now)} name={name} timeZone={timeZone} firstRequired />
      {more.length > 0 ? (
        <details className="rounded-xl border border-input/60 px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium text-teal-ink">
            More times ({more.length})
          </summary>
          <div className="mt-3">
            <DayCards
              groups={groupByDay(more, timeZone, now)}
              name={name}
              timeZone={timeZone}
              firstRequired={false}
            />
          </div>
        </details>
      ) : null}
    </fieldset>
  );
}
