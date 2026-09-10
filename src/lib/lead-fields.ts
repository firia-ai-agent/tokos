/**
 * The lead record's field inventory, in one place (TOK-49).
 *
 * Every picker on the lead — service type, source, insurance — used to be a string list
 * waiting to be typed twice: once in the `<select>`, once in whatever validated the POST.
 * They are defined here instead, so the form, the server action, the CSV importer and the
 * filter bar all read the same list, and adding "childbirth class" is one line rather than
 * a grep.
 *
 * Everything here is pure. No database, no session — the rules are testable on their own,
 * and a client surface can import a label without dragging the CRM in behind it.
 */

import { differenceInCalendarDays, format, parseISO } from "date-fns";

export type LeadOption = { value: string; label: string };

/**
 * NOVA's service list. A constant for now, by design: the agency-editable version is a
 * settings table, and shipping the picker first is what makes the import useful today.
 */
export const SERVICE_TYPES = [
  "birth_support",
  "postpartum",
  "overnight",
  "lactation",
  "childbirth_class",
  "mothers_helper",
] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  birth_support: "Birth support",
  postpartum: "Postpartum",
  overnight: "Overnight / night nanny",
  lactation: "Lactation",
  childbirth_class: "Childbirth class",
  mothers_helper: "Mother's helper",
};

/** Where the lead came from. `imported` is set by the CSV path, never typed by hand. */
export const LEAD_SOURCES = [
  "referral",
  "email",
  "phone",
  "website",
  "imported",
  "event",
  "other",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  referral: "Referral",
  email: "Email",
  phone: "Text / call",
  website: "Website",
  imported: "Imported",
  event: "Event",
  other: "Other",
};

/** Legacy and inbound spellings that mean one of ours. */
const SOURCE_ALIASES: Record<string, LeadSource> = {
  web: "website",
  "web form": "website",
  site: "website",
  text: "phone",
  call: "phone",
  "text/call": "phone",
  "phone call": "phone",
  sms: "phone",
  refer: "referral",
  "word of mouth": "referral",
  instagram: "other",
  import: "imported",
  airtable: "imported",
};

/**
 * `clients.source` predates the picker and holds free text like `web`. Normalising on
 * read rather than migrating the column keeps every historic row readable and means a
 * new inbound spelling costs an alias, not a backfill.
 */
export function normalizeSource(raw: string | null | undefined): LeadSource {
  const value = String(raw ?? "").trim().toLowerCase();
  if ((LEAD_SOURCES as readonly string[]).includes(value)) return value as LeadSource;
  return SOURCE_ALIASES[value] ?? "other";
}

export function leadSourceLabel(raw: string | null | undefined): string {
  return LEAD_SOURCE_LABELS[normalizeSource(raw)];
}

/**
 * Insurance is captured so a future superbill is not a data hunt. Three states, because
 * "we never asked" and "she said no" are different facts and only one of them is a task.
 */
export const INSURANCE_STATUSES = ["yes", "no", "unknown"] as const;
export type InsuranceStatus = (typeof INSURANCE_STATUSES)[number];

export const INSURANCE_LABELS: Record<InsuranceStatus, string> = {
  yes: "Insured",
  no: "Not insured",
  unknown: "Insurance unknown",
};

export function normalizeInsurance(raw: string | null | undefined): InsuranceStatus {
  const value = String(raw ?? "").trim().toLowerCase();
  if ((INSURANCE_STATUSES as readonly string[]).includes(value)) {
    return value as InsuranceStatus;
  }
  if (["y", "true", "1", "insured", "has insurance"].includes(value)) return "yes";
  if (["n", "false", "0", "uninsured", "self pay", "self-pay"].includes(value)) return "no";
  return "unknown";
}

export function insuranceLabel(raw: string | null | undefined): string {
  return INSURANCE_LABELS[normalizeInsurance(raw)];
}

export function serviceTypeLabel(raw: string | null | undefined): string {
  const value = String(raw ?? "").trim();
  return SERVICE_TYPE_LABELS[value as ServiceType] ?? "";
}

/** Where a line in the notes feed came from. */
export const AI_NOTE_SOURCES = ["staff", "import", "system"] as const;
export type AiNoteSource = (typeof AI_NOTE_SOURCES)[number];

export const AI_NOTE_SOURCE_LABELS: Record<AiNoteSource, string> = {
  staff: "Logged by staff",
  import: "From import",
  system: "From Tokos",
};

export function aiNoteSourceLabel(raw: string | null | undefined): string {
  const value = String(raw ?? "").trim().toLowerCase();
  return AI_NOTE_SOURCE_LABELS[value as AiNoteSource] ?? AI_NOTE_SOURCE_LABELS.system;
}

const asOptions = <T extends string>(values: readonly T[], labels: Record<T, string>) =>
  values.map((value) => ({ value, label: labels[value] }));

export const SERVICE_TYPE_OPTIONS: LeadOption[] = asOptions(SERVICE_TYPES, SERVICE_TYPE_LABELS);
export const LEAD_SOURCE_OPTIONS: LeadOption[] = asOptions(LEAD_SOURCES, LEAD_SOURCE_LABELS);
export const INSURANCE_OPTIONS: LeadOption[] = asOptions(INSURANCE_STATUSES, INSURANCE_LABELS);

/* ------------------------------------------------------------------ field defs ---- */

export type LeadFieldType = "text" | "tel" | "date" | "select";

export type LeadFieldDef = {
  key: LeadFieldKey;
  /** Column on `clients`. Named separately so a label change is never a schema change. */
  column: string;
  label: string;
  type: LeadFieldType;
  options?: readonly LeadOption[];
  placeholder?: string;
  hint?: string;
  /** Agency machinery a doula's surface never renders (TOK-34). */
  agencyOnly?: boolean;
};

export const LEAD_FIELD_KEYS = [
  "serviceType",
  "phone",
  "edd",
  "city",
  "postalCode",
  "hospital",
  "assignedProvider",
  "insurance",
  "insuranceProvider",
  "source",
  "consultDate",
  "followUpDueOn",
  "intakeRef",
] as const;
export type LeadFieldKey = (typeof LEAD_FIELD_KEYS)[number];

export const LEAD_FIELDS: readonly LeadFieldDef[] = [
  {
    key: "serviceType",
    column: "service_type",
    label: "Service type",
    type: "select",
    options: SERVICE_TYPE_OPTIONS,
  },
  { key: "phone", column: "phone", label: "Phone", type: "tel", placeholder: "(571) 555-0100" },
  { key: "edd", column: "edd", label: "EDD / birth date", type: "date" },
  { key: "city", column: "city", label: "City", type: "text" },
  { key: "postalCode", column: "postal_code", label: "Zip", type: "text" },
  { key: "hospital", column: "hospital", label: "Hospital / facility", type: "text" },
  {
    key: "assignedProvider",
    column: "assigned_provider",
    label: "Assigned provider",
    type: "text",
    hint: "OB or midwife — care context, not the matched doula.",
  },
  {
    key: "insurance",
    column: "insurance",
    label: "Insurance",
    type: "select",
    options: INSURANCE_OPTIONS,
  },
  {
    key: "insuranceProvider",
    column: "insurance_provider",
    label: "Insurance provider",
    type: "text",
  },
  {
    key: "source",
    column: "source",
    label: "Source",
    type: "select",
    options: LEAD_SOURCE_OPTIONS,
    agencyOnly: true,
  },
  {
    key: "consultDate",
    column: "consult_date",
    label: "Consult date",
    type: "date",
    hint: "Required before the record can sit on Consult scheduled.",
  },
  {
    key: "followUpDueOn",
    column: "follow_up_due_on",
    label: "Follow-up due",
    type: "date",
    hint: "The date the board sorts on. Every open lead should carry one.",
  },
  {
    key: "intakeRef",
    column: "intake_ref",
    label: "Intake #",
    type: "text",
    placeholder: "PSAF-1042",
    hint: "External reference. Preserved on re-import.",
    agencyOnly: true,
  },
];

export const LEAD_FIELDS_BY_KEY: Record<LeadFieldKey, LeadFieldDef> = Object.fromEntries(
  LEAD_FIELDS.map((field) => [field.key, field]),
) as Record<LeadFieldKey, LeadFieldDef>;

/** The subset a given persona may edit. A doula never sets Source or the intake number. */
export function leadFieldsFor(persona: "agency" | "doula"): readonly LeadFieldDef[] {
  return persona === "agency" ? LEAD_FIELDS : LEAD_FIELDS.filter((field) => !field.agencyOnly);
}

export type LeadFieldValues = Partial<Record<LeadFieldKey, string | null>>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A `<select>` may only post one of its own options; anything else is dropped. */
function coerceField(field: LeadFieldDef, raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  if (field.type === "select") {
    const allowed = field.options?.some((option) => option.value === value);
    return allowed ? value : null;
  }
  if (field.type === "date") return ISO_DATE.test(value) ? value : null;
  return value;
}

/**
 * Read a posted lead form through the defs. Only keys the persona owns are considered, so
 * a doula POSTing `source=referral` by hand changes nothing — the guard is the field list
 * itself rather than a second copy of it in the action.
 */
export function parseLeadFields(
  get: (key: string) => unknown,
  persona: "agency" | "doula" = "agency",
): LeadFieldValues {
  const out: LeadFieldValues = {};
  for (const field of leadFieldsFor(persona)) {
    // An absent input leaves the column alone; a present-but-empty one clears it.
    const raw = get(field.key);
    if (raw === undefined || raw === null) continue;
    out[field.key] = coerceField(field, raw);
  }
  return out;
}

/* ---------------------------------------------------------------- date helpers ---- */

/** Parse a `yyyy-MM-dd` column at local noon, so a timezone never moves it a day. */
export function leadDate(value: string | null | undefined): Date | null {
  const raw = String(value ?? "").trim();
  if (!ISO_DATE.test(raw)) return null;
  const date = parseISO(`${raw}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export type Gestation = { weeks: number; days: number; label: string };

/**
 * Weeks of gestation from an EDD, counting back from the 280-day term. "35w2d" is how
 * every intake form and every hospital chart writes it, so it is how the board writes it.
 * Past the due date it keeps counting — 41w0d is a real and important number.
 */
export function gestationFromEdd(
  edd: string | null | undefined,
  today: Date = new Date(),
): Gestation | null {
  const date = leadDate(edd);
  if (!date) return null;
  const daysToGo = differenceInCalendarDays(date, today);
  const elapsed = 280 - daysToGo;
  if (elapsed < 0 || elapsed > 315) return null;
  const weeks = Math.floor(elapsed / 7);
  const days = elapsed % 7;
  return { weeks, days, label: `${weeks}w${days}d` };
}

/** "EDD Oct 13 · 35w2d", or just the date when gestation is out of a sane range. */
export function eddWithWeeks(
  edd: string | null | undefined,
  today: Date = new Date(),
): string | null {
  const date = leadDate(edd);
  if (!date) return null;
  const gestation = gestationFromEdd(edd, today);
  return gestation
    ? `EDD ${format(date, "MMM d")} · ${gestation.label}`
    : `EDD ${format(date, "MMM d")}`;
}

export type FollowUpState = "none" | "overdue" | "today" | "upcoming";

export type FollowUp = {
  state: FollowUpState;
  label: string;
  /** Days until due; negative when overdue. null when there is no date. */
  daysOut: number | null;
};

/**
 * The most important field on the board, read as a state rather than a date, so "red when
 * overdue" is decided once instead of in every row that renders it.
 */
export function followUpState(
  dueOn: string | null | undefined,
  today: Date = new Date(),
): FollowUp {
  const date = leadDate(dueOn);
  if (!date) return { state: "none", label: "No follow-up set", daysOut: null };
  const daysOut = differenceInCalendarDays(date, today);
  if (daysOut < 0) {
    const overdue = Math.abs(daysOut);
    return {
      state: "overdue",
      label: `Overdue ${overdue}d · ${format(date, "MMM d")}`,
      daysOut,
    };
  }
  if (daysOut === 0) return { state: "today", label: "Due today", daysOut };
  return { state: "upcoming", label: `Due ${format(date, "MMM d")}`, daysOut };
}

/**
 * Sort key for "Follow-Up Due ascending, overdue pinned on top". A record with no date
 * sorts last — it is not urgent, it is unplanned, and the unreviewed rule already catches
 * it. Returns a comparable number so the list can sort without re-parsing dates per pair.
 */
export function followUpSortKey(
  dueOn: string | null | undefined,
  today: Date = new Date(),
): number {
  const date = leadDate(dueOn);
  if (!date) return Number.MAX_SAFE_INTEGER;
  return differenceInCalendarDays(date, today);
}

/** "3d ago" / "today" / "never". What Last Contact reads as on a dense row. */
export function lastContactLabel(
  at: Date | string | null | undefined,
  now: Date = new Date(),
): string {
  if (!at) return "No contact logged";
  const date = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(date.getTime())) return "No contact logged";
  const days = differenceInCalendarDays(now, date);
  if (days <= 0) return "Today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  return format(date, "MMM d");
}

/** EDD month key + label, for the board's "EDD month" filter. */
export function eddMonthKey(edd: string | null | undefined): string | null {
  const date = leadDate(edd);
  return date ? format(date, "yyyy-MM") : null;
}

export function eddMonthLabel(key: string): string {
  const date = leadDate(`${key}-01`);
  return date ? format(date, "MMM yyyy") : key;
}
