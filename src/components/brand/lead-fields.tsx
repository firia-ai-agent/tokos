import { format } from "date-fns";
import {
  LEAD_FIELDS_BY_KEY,
  aiNoteSourceLabel,
  eddWithWeeks,
  followUpState,
  lastContactLabel,
  leadFieldsFor,
  type LeadFieldDef,
  type LeadFieldKey,
} from "@/lib/lead-fields";
import type { ShellPersona } from "@/lib/shell-persona";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The lead record's fields, rendered from `@/lib/lead-fields` (TOK-49).
 *
 * Nothing here knows what a service type is: the labels, the input types and the picker
 * options all arrive as config, which is what keeps the form, the CSV importer and the
 * filter bar from drifting into three different ideas of the same field.
 */

const inputClass =
  "mt-1 h-9 w-full rounded-md border border-teal/20 bg-card px-2.5 text-[13px] text-teal-ink focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/25";

export type LeadFieldValueMap = Partial<Record<LeadFieldKey, string | null>>;

function LeadFieldInput({ field, value }: { field: LeadFieldDef; value: string | null }) {
  const id = `lead-${field.key}`;
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
      >
        {field.label}
      </label>
      {field.type === "select" ? (
        <select id={id} name={field.key} defaultValue={value ?? ""} className={inputClass}>
          <option value="">—</option>
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          name={field.key}
          type={field.type === "date" ? "date" : field.type === "tel" ? "tel" : "text"}
          defaultValue={value ?? ""}
          placeholder={field.placeholder}
          className={inputClass}
        />
      )}
      {field.hint ? (
        <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">{field.hint}</p>
      ) : null}
    </div>
  );
}

export function LeadFieldsForm({
  clientId,
  persona,
  values,
  action,
}: {
  clientId: string;
  persona: ShellPersona;
  values: LeadFieldValueMap;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const fields = leadFieldsFor(persona);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="clientId" value={clientId} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {fields.map((field) => (
          <LeadFieldInput key={field.key} field={field} value={values[field.key] ?? null} />
        ))}
      </div>
      <Button type="submit" size="sm" variant="outline">
        Save lead details
      </Button>
    </form>
  );
}

/** The read-only summary strip at the top of a record — the same defs, no inputs. */
export function LeadSummary({
  values,
  persona,
  className,
}: {
  values: LeadFieldValueMap & { lastContactAt?: Date | null };
  persona: ShellPersona;
  className?: string;
}) {
  const follow = followUpState(values.followUpDueOn);
  const items: Array<{ label: string; value: string; tone?: "coral" }> = [];

  const edd = eddWithWeeks(values.edd);
  if (edd) items.push({ label: LEAD_FIELDS_BY_KEY.edd.label, value: edd });
  items.push({
    label: LEAD_FIELDS_BY_KEY.followUpDueOn.label,
    value: follow.label,
    tone: follow.state === "overdue" ? "coral" : undefined,
  });
  items.push({ label: "Last contact", value: lastContactLabel(values.lastContactAt) });

  for (const field of leadFieldsFor(persona)) {
    if (field.key === "edd" || field.key === "followUpDueOn") continue;
    const raw = values[field.key];
    if (!raw) continue;
    const label =
      field.options?.find((option) => option.value === raw)?.label ??
      (field.type === "date" ? format(new Date(`${raw}T12:00:00`), "MMM d, yyyy") : raw);
    items.push({ label: field.label, value: label });
  }

  return (
    <dl className={cn("grid gap-x-6 gap-y-2 sm:grid-cols-2 xl:grid-cols-3", className)}>
      {items.map((item) => (
        <div key={`${item.label}-${item.value}`} className="min-w-0">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {item.label}
          </dt>
          <dd
            className={cn(
              "truncate text-[13.5px] font-medium",
              item.tone === "coral" ? "text-coral" : "text-teal-ink",
            )}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export type LeadNote = {
  id: string;
  body: string;
  source: string;
  at: Date;
  actorName: string | null;
};

/**
 * The running notes feed. Chronological, newest first, and every line says where it came
 * from — which is the property that lets a machine-written daily summary sit in the same
 * list later without a reader mistaking it for something a person observed.
 */
export function LeadNotesFeed({
  clientId,
  notes,
  action,
}: {
  clientId: string;
  notes: readonly LeadNote[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <div className="space-y-4">
      <form action={action} className="space-y-2">
        <input type="hidden" name="clientId" value={clientId} />
        <label htmlFor="note-body" className="sr-only">
          Add a note
        </label>
        <textarea
          id="note-body"
          name="body"
          rows={2}
          required
          placeholder="What happened? Consult notes, a call, what she asked for…"
          className="w-full rounded-md border border-teal/20 bg-card px-3 py-2 text-[13px] text-teal-ink focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/25"
        />
        <Button type="submit" size="sm" variant="outline">
          Add note
        </Button>
      </form>

      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No notes yet. A consult with nothing written down is the one that gets
          re-litigated from memory a month later.
        </p>
      ) : (
        <ol className="space-y-2.5">
          {notes.map((note) => (
            <li key={note.id} className="rounded-lg bg-cloud px-3.5 py-2.5 ring-1 ring-teal/10">
              <p className="text-[13.5px] leading-relaxed text-teal-ink">{note.body}</p>
              <p className="mt-1 text-[11.5px] text-muted-foreground">
                {format(note.at, "MMM d, yyyy · h:mma")} · {aiNoteSourceLabel(note.source)}
                {note.actorName ? ` · ${note.actorName}` : ""}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
