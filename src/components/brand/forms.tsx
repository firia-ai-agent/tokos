import { Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { answeredFields, isSensitiveField, type FormSchema } from "@/lib/forms";
import { cn } from "@/lib/utils";

/** Coral lock — the same marker on the builder, the portal, and the co-complete card. */
export function SensitiveBadge() {
  return (
    <Badge
      variant="secondary"
      className="gap-1 bg-coral/12 text-coral"
      title="Kept in the portal — never written into email"
    >
      <Lock aria-hidden />
      Sensitive
    </Badge>
  );
}

/** One line of reassurance, used wherever sensitive answers are on screen. */
export function PhiNote({ className }: { className?: string }) {
  return (
    <p className={cn("text-[12px] text-muted-foreground", className)}>
      Answers stay in the portal. Reminder emails carry only a name, a link, and a count.
    </p>
  );
}

/**
 * The completed-form view. Same component for the family and for the doula, so what a
 * client sees after submitting is exactly what the co-complete card shows.
 */
export function FormAnswers({
  schema,
  answers,
  emptyLabel = "Not answered",
}: {
  schema: FormSchema;
  answers: Record<string, string> | null | undefined;
  emptyLabel?: string;
}) {
  const entries = answeredFields(schema, answers);

  return (
    <dl className="space-y-2.5">
      {entries.map(({ field, value, sensitive }) => (
        <div key={field.id} className="rounded-lg bg-cloud px-3 py-2.5 ring-1 ring-teal/10">
          <dt className="flex flex-wrap items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            {field.label}
            {sensitive ? <SensitiveBadge /> : null}
          </dt>
          <dd
            className={cn(
              "mt-1",
              value
                ? "whitespace-pre-wrap text-[13.5px] leading-relaxed text-teal-ink"
                : "text-[13px] italic text-muted-foreground",
            )}
          >
            {value || emptyLabel}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The fill-in view. `idPrefix` keeps labels bound to their input when several forms
 * share a page, and `defaults` lets a co-complete session start from what the family
 * already typed instead of a blank card.
 */
export function FormFieldInputs({
  schema,
  idPrefix,
  defaults,
}: {
  schema: FormSchema;
  idPrefix: string;
  defaults?: Record<string, string> | null;
}) {
  return (
    <div className="space-y-3">
      {schema.fields.map((field) => {
        const inputId = `${idPrefix}-${field.id}`;
        const defaultValue = defaults?.[field.id] ?? "";
        return (
          <div key={field.id} className="space-y-1.5">
            <label
              htmlFor={inputId}
              className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-teal-ink"
            >
              {field.label}
              {isSensitiveField(field) ? <SensitiveBadge /> : null}
            </label>
            {field.type === "textarea" ? (
              <Textarea
                id={inputId}
                name={`field-${field.id}`}
                rows={3}
                defaultValue={defaultValue}
              />
            ) : (
              <Input
                id={inputId}
                name={`field-${field.id}`}
                type={field.type === "date" ? "date" : "text"}
                defaultValue={defaultValue}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
