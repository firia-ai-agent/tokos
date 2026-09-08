import { assertPhiFree } from "@/lib/phi";

export type FormField = {
  id: string;
  label: string;
  type: string;
  sensitive?: boolean;
};

export type FormSchema = { fields: FormField[] };

export const FIELD_TYPES = ["text", "textarea", "date"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

/**
 * What a doula is likely to write when a question invites an answer that must stay
 * behind the portal login. Wider on purpose than the outbox regex in `lib/phi`: that
 * one decides what may leave in an email, this one decides what earns a badge and
 * never gets summarized anywhere outside the portal.
 */
const SENSITIVE_LABEL =
  /note|diagnos|health|medical|clinical|medicat|allerg|condition|history|provider|pregnan|blood|ssn|insurance|therap|symptom|trauma|loss/i;

/** Explicit `sensitive: true` wins; otherwise the wording of the question decides. */
export function isSensitiveField(field: FormField): boolean {
  if (field.sensitive === true) return true;
  return SENSITIVE_LABEL.test(field.label) || SENSITIVE_LABEL.test(field.id);
}

export function sensitiveFieldIds(schema: FormSchema): string[] {
  return schema.fields.filter(isSensitiveField).map((field) => field.id);
}

export function fieldIdFromLabel(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return slug || "field";
}

/**
 * The template builder is one textarea, one field per line: `Label | type | sensitive`.
 * Type and the sensitive marker are optional, an unknown type falls back to text, and
 * ids are derived from the label so a doula never has to invent one.
 */
export function parseFieldSpec(raw: string): FormField[] {
  const fields: FormField[] = [];
  const seen = new Set<string>();

  for (const line of raw.split(/\r?\n/)) {
    const [labelPart, typePart, flagPart] = line.split("|").map((part) => part.trim());
    const label = labelPart?.trim();
    if (!label) continue;

    const declared = (typePart ?? "").toLowerCase();
    const type: FieldType = (FIELD_TYPES as readonly string[]).includes(declared)
      ? (declared as FieldType)
      : "text";

    let id = fieldIdFromLabel(label);
    if (seen.has(id)) {
      let suffix = 2;
      while (seen.has(`${id}_${suffix}`)) suffix += 1;
      id = `${id}_${suffix}`;
    }
    seen.add(id);

    const field: FormField = { id, label, type };
    if (/^(sensitive|private|phi)$/i.test(flagPart ?? "") || isSensitiveField(field)) {
      field.sensitive = true;
    }
    fields.push(field);
  }

  return fields;
}

/** Only `field-*` inputs are answers; everything else on the form is plumbing. */
export function readAnswers(entries: Iterable<[string, FormDataEntryValue]>) {
  const answers: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (!key.startsWith("field-")) continue;
    if (typeof value !== "string") continue;
    const id = key.slice("field-".length);
    if (!id) continue;
    answers[id] = value;
  }
  return answers;
}

export type AnsweredField = {
  field: FormField;
  value: string;
  sensitive: boolean;
};

/** Portal review and doula co-complete render the same list, so they agree on badges. */
export function answeredFields(
  schema: FormSchema,
  answers: Record<string, string> | null | undefined,
): AnsweredField[] {
  return schema.fields.map((field) => ({
    field,
    value: (answers?.[field.id] ?? "").trim(),
    sensitive: isSensitiveField(field),
  }));
}

export function answeredCount(
  schema: FormSchema,
  answers: Record<string, string> | null | undefined,
): number {
  return answeredFields(schema, answers).filter((entry) => entry.value.length > 0).length;
}

/**
 * The only vars a form email may carry: who it is for, where to go, and how much is
 * open. Answers are not parameters here, so there is nothing to accidentally forward.
 */
export function formReminderVars(input: {
  clientName: string;
  portalUrl: string;
  openCount: number;
}): Record<string, string> {
  const vars = {
    client_name: input.clientName,
    portal_url: input.portalUrl,
    open_forms: String(input.openCount),
  };
  assertPhiFree(vars, "form reminder");
  return vars;
}

/**
 * Last gate before an enqueue: no var may carry something the family typed into a form.
 * The recipient's own name is already the greeting, so an answer that is exactly that
 * name is not treated as a leak — anything else that shows up in a var is.
 */
export function assertAnswersNotInEmail(
  vars: Record<string, string>,
  answers: Record<string, string>,
  context: string,
) {
  assertPhiFree(vars, context);
  const recipient = String(vars.client_name ?? "").trim().toLowerCase();
  const values = Object.values(vars).map((value) => String(value).toLowerCase());

  for (const [key, raw] of Object.entries(answers)) {
    const answer = String(raw ?? "").trim().toLowerCase();
    if (!answer) continue;
    if (answer === recipient) continue;
    if (values.some((value) => value.includes(answer))) {
      throw new Error(`PHI firewall: answer "${key}" would leave in ${context}`);
    }
  }
}
