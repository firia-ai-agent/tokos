import { cn } from "@/lib/utils";

/**
 * The share UX primitives (TOK-50 / CRM-FIRST §2).
 *
 * The library used to embed a Family `<select>` and an Assign button in *every* template
 * card and *every* resource card. Sending three handouts to one family meant picking her
 * name three times, and sending one handout to three families meant three round trips.
 * It read like a ticket queue, not a CRM.
 *
 * These are the two halves of the replacement: a checkbox list of things, and a checkbox
 * list of families. One form wraps both, and one primary button sends the whole grid.
 * Server components with plain checkboxes — no client bundle, and the browser's own
 * `formData.getAll()` carries the multi-select.
 */

export function PickList({
  name,
  items,
  emptyLabel,
  columns = 1,
}: {
  /** Repeated for every checkbox, so the action reads it with `formData.getAll(name)`. */
  name: string;
  items: ReadonlyArray<{ id: string; label: string; hint?: string }>;
  emptyLabel: string;
  columns?: 1 | 2;
}) {
  if (items.length === 0) {
    return <p className="text-[12.5px] text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <ul
      className={cn(
        "grid max-h-56 gap-1 overflow-y-auto pr-1",
        columns === 2 ? "sm:grid-cols-2" : "grid-cols-1",
      )}
    >
      {items.map((item) => (
        <li key={item.id}>
          <label className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-[13px] text-teal-ink transition hover:bg-teal/8">
            <input
              type="checkbox"
              name={name}
              value={item.id}
              className="mt-[3px] size-3.5 shrink-0 accent-teal"
            />
            <span className="min-w-0">
              <span className="font-medium">{item.label}</span>
              {item.hint ? (
                <span className="block text-[11.5px] text-muted-foreground">{item.hint}</span>
              ) : null}
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}

/** Small uppercase heading over a pick list, matching the filter labels on the board. */
export function PickHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
      {children}
    </p>
  );
}
