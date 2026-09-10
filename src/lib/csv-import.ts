/**
 * CSV lead import (TOK-49).
 *
 * NOVA's 44 live leads sit in Airtable. This is the migration path: an exported CSV,
 * mapped onto the lead fields, deduped, and applied as an upsert. Deliberately **not** a
 * live Airtable integration — no API key, no invite token, no third-party credential in
 * this repo or in an env var, because a one-time migration does not justify holding a
 * standing key to someone else's base.
 *
 * Everything here is pure: parse, map, validate, plan. The server action does the reads
 * and writes around it, which is what makes "re-import is safe" a test rather than a
 * promise.
 */

import {
  LEAD_SOURCE_LABELS,
  SERVICE_TYPE_LABELS,
  SERVICE_TYPES,
  normalizeInsurance,
  type InsuranceStatus,
  type LeadSource,
  type ServiceType,
} from "@/lib/lead-fields";
import { migrateStage, type PipelineStageName } from "@/lib/pipeline";

/* --------------------------------------------------------------------- parsing ---- */

/**
 * RFC4180-ish reader: quoted fields, escaped `""`, embedded commas and newlines, and
 * either line ending. Small enough to own — a dependency for one screen of code is a
 * dependency to keep patched forever.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let started = false;

  const endField = () => {
    row.push(field);
    field = "";
    started = false;
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  // Strip a UTF-8 BOM: Excel writes one, and it would otherwise become part of the first
  // header name and quietly unmap that column.
  const input = text.replace(/^﻿/, "");

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"' && !started) {
      quoted = true;
      started = true;
      continue;
    }
    if (char === ",") {
      endField();
      continue;
    }
    if (char === "\r") continue;
    if (char === "\n") {
      endRow();
      continue;
    }
    field += char;
    started = true;
  }

  if (field.length > 0 || row.length > 0) endRow();
  return rows.filter((line) => line.some((cell) => cell.trim() !== ""));
}

/* --------------------------------------------------------------------- mapping ---- */

export const IMPORT_FIELDS = [
  "intakeRef",
  "displayName",
  "email",
  "phone",
  "serviceType",
  "edd",
  "city",
  "postalCode",
  "hospital",
  "assignedProvider",
  "insurance",
  "insuranceProvider",
  "consultDate",
  "followUpDueOn",
  "lastContactOn",
  "stage",
  "ownerName",
  "notes",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

/**
 * Header aliases, lowercased and stripped of punctuation. Airtable columns are whatever
 * the person who made the base typed, so the map is generous on the way in and exact on
 * the way out.
 */
export const COLUMN_ALIASES: Record<ImportField, readonly string[]> = {
  intakeRef: ["intake", "intake #", "intake number", "intake ref", "psaf", "bdq", "record id"],
  displayName: ["name", "client", "client name", "full name", "lead", "lead name"],
  email: ["email", "email address", "e mail"],
  phone: ["phone", "phone number", "mobile", "cell"],
  serviceType: ["service", "service type", "package", "services"],
  edd: ["edd", "due date", "estimated due date", "birth date"],
  city: ["city", "town"],
  postalCode: ["zip", "zip code", "postal code", "postcode"],
  hospital: ["hospital", "facility", "birth location", "hospital facility"],
  assignedProvider: ["provider", "assigned provider", "ob", "midwife", "ob midwife"],
  insurance: ["insurance", "insured", "has insurance"],
  insuranceProvider: ["insurance provider", "carrier", "insurance carrier", "plan"],
  consultDate: ["consult", "consult date", "consultation date"],
  followUpDueOn: ["follow up", "follow up due", "next follow up", "follow up date"],
  lastContactOn: ["last contact", "last contacted", "last touch"],
  stage: ["stage", "status", "pipeline stage"],
  ownerName: ["owner", "assigned to", "lead owner"],
  notes: ["notes", "note", "comments", "ai notes"],
};

function normalizeHeader(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export type ColumnMap = Partial<Record<ImportField, number>>;

/** Header row → column indexes. Unknown columns are ignored, not an error. */
export function mapColumns(header: readonly string[]): ColumnMap {
  const normalized = header.map(normalizeHeader);
  const map: ColumnMap = {};
  for (const field of IMPORT_FIELDS) {
    const aliases = COLUMN_ALIASES[field];
    const index = normalized.findIndex((name) => name !== "" && aliases.includes(name));
    if (index >= 0) map[field] = index;
  }
  return map;
}

/* ------------------------------------------------------------------ conversion ---- */

const SERVICE_ALIASES: Record<string, ServiceType> = Object.fromEntries([
  ...SERVICE_TYPES.map((value) => [value, value] as const),
  ...SERVICE_TYPES.map(
    (value) => [SERVICE_TYPE_LABELS[value].toLowerCase(), value] as const,
  ),
  ["birth", "birth_support"] as const,
  ["birth doula", "birth_support"] as const,
  ["labor support", "birth_support"] as const,
  ["postpartum doula", "postpartum"] as const,
  ["night nanny", "overnight"] as const,
  ["overnight care", "overnight"] as const,
  ["lactation support", "lactation"] as const,
  ["class", "childbirth_class"] as const,
  ["mothers helper", "mothers_helper"] as const,
  ["mother's helper", "mothers_helper"] as const,
]);

export function normalizeServiceType(raw: string | null | undefined): ServiceType | null {
  const value = String(raw ?? "").trim().toLowerCase();
  if (!value) return null;
  return SERVICE_ALIASES[value] ?? null;
}

const US_DATE = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Accept `2026-10-13` and `10/13/2026`; refuse anything ambiguous rather than guess. */
export function normalizeDate(raw: string | null | undefined): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  if (ISO_DATE.test(value)) return isRealDate(value) ? value : null;
  const us = US_DATE.exec(value);
  if (!us) return null;
  const [, month, day, year] = us;
  const yyyy = year.length === 2 ? `20${year}` : year;
  const iso = `${yyyy}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  return isRealDate(iso) ? iso : null;
}

function isRealDate(iso: string): boolean {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** The importer never types a source: everything that arrives this way is `imported`. */
export const IMPORT_SOURCE: LeadSource = "imported";

export type LeadImportRecord = {
  /** 1-based line in the file, for error messages a human can act on. */
  line: number;
  intakeRef: string | null;
  displayName: string;
  email: string;
  phone: string | null;
  serviceType: ServiceType | null;
  edd: string | null;
  city: string | null;
  postalCode: string | null;
  hospital: string | null;
  assignedProvider: string | null;
  insurance: InsuranceStatus;
  insuranceProvider: string | null;
  consultDate: string | null;
  followUpDueOn: string | null;
  lastContactOn: string | null;
  stage: string | null;
  ownerName: string | null;
  notes: string | null;
  source: LeadSource;
};

export type ImportRowError = { line: number; field: string; message: string };

const EMAILISH = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cell(row: readonly string[], map: ColumnMap, field: ImportField): string | null {
  const index = map[field];
  if (index === undefined) return null;
  const value = (row[index] ?? "").trim();
  return value === "" ? null : value;
}

export type MappedCsv = {
  columns: ColumnMap;
  records: LeadImportRecord[];
  errors: ImportRowError[];
  /** Headers present in the file that nothing consumed — shown so a typo is visible. */
  unmappedHeaders: string[];
};

/**
 * Parse + map + validate in one pass. A row that cannot become a lead becomes an error
 * with its line number instead of a half-populated client nobody can find.
 */
export function mapCsv(text: string): MappedCsv {
  const rows = parseCsv(text);
  if (rows.length === 0) {
    return { columns: {}, records: [], errors: [], unmappedHeaders: [] };
  }
  const [header, ...body] = rows;
  const columns = mapColumns(header);
  const used = new Set(Object.values(columns));
  const unmappedHeaders = header
    .map((name, index) => ({ name: name.trim(), index }))
    .filter((item) => item.name !== "" && !used.has(item.index))
    .map((item) => item.name);

  const records: LeadImportRecord[] = [];
  const errors: ImportRowError[] = [];

  body.forEach((row, offset) => {
    const line = offset + 2; // header is line 1
    const displayName = cell(row, columns, "displayName");
    const email = cell(row, columns, "email")?.toLowerCase() ?? null;

    if (!displayName) {
      errors.push({ line, field: "displayName", message: "Name is required." });
      return;
    }
    if (!email) {
      errors.push({ line, field: "email", message: "Email is required." });
      return;
    }
    if (!EMAILISH.test(email)) {
      errors.push({ line, field: "email", message: `"${email}" is not an email address.` });
      return;
    }

    records.push({
      line,
      intakeRef: cell(row, columns, "intakeRef"),
      displayName,
      email,
      phone: cell(row, columns, "phone"),
      serviceType: normalizeServiceType(cell(row, columns, "serviceType")),
      edd: normalizeDate(cell(row, columns, "edd")),
      city: cell(row, columns, "city"),
      postalCode: cell(row, columns, "postalCode"),
      hospital: cell(row, columns, "hospital"),
      assignedProvider: cell(row, columns, "assignedProvider"),
      insurance: normalizeInsurance(cell(row, columns, "insurance")),
      insuranceProvider: cell(row, columns, "insuranceProvider"),
      consultDate: normalizeDate(cell(row, columns, "consultDate")),
      followUpDueOn: normalizeDate(cell(row, columns, "followUpDueOn")),
      lastContactOn: normalizeDate(cell(row, columns, "lastContactOn")),
      stage: cell(row, columns, "stage"),
      ownerName: cell(row, columns, "ownerName"),
      notes: cell(row, columns, "notes"),
      // Not read from the file on purpose: an import is an import, whatever the
      // spreadsheet's own Source column says.
      source: IMPORT_SOURCE,
    });
  });

  return { columns, records, errors, unmappedHeaders };
}

/**
 * Stages an import may land on.
 *
 * A spreadsheet cannot put a family on `agreement_signed`, `complete` or `active_care`:
 * those stages are claims about a signature and about money, and the only things allowed
 * to make them are the contract and payment paths. Anything past fit confirmed — or
 * anything unrecognised — comes in as a new lead for a human to move on.
 */
export const IMPORTABLE_STAGES: readonly PipelineStageName[] = [
  "new_lead",
  "outreach_sent",
  "consult_scheduled",
  "consult_done",
  "fit_confirmed",
];

export function normalizeImportStage(
  raw: string | null | undefined,
  opts: { hasConsultDate?: boolean } = {},
): PipelineStageName {
  const value = String(raw ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const stage = migrateStage(value);
  if (!IMPORTABLE_STAGES.includes(stage)) return "new_lead";
  // The consult-date gate is a pipeline rule, so the importer honours it rather than
  // writing a stage the dropdown would then refuse to move off.
  if (stage === "consult_scheduled" && !opts.hasConsultDate) return "outreach_sent";
  return stage;
}

/* -------------------------------------------------------------------- planning ---- */

/** What the org already holds, for dedupe. Read org-scoped by the caller. */
export type ExistingClient = { id: string; email: string; intakeRef: string | null };

export type ImportAction =
  | { kind: "create"; record: LeadImportRecord }
  | { kind: "update"; clientId: string; record: LeadImportRecord; matchedOn: "intakeRef" | "email" }
  | { kind: "skip"; record: LeadImportRecord; matchedOn: "intakeRef" | "email" };

export type ImportPlan = {
  actions: ImportAction[];
  creates: number;
  updates: number;
  skipped: number;
  errors: ImportRowError[];
};

/**
 * Decide create vs update per row.
 *
 * Intake # wins over email, because it is the identity NOVA already trusts and two
 * households genuinely do share an address. A second row in the same file that resolves
 * to the same lead is a `skip`, not a second write — re-importing the export you just
 * fixed should not double the board.
 */
export function planImport(
  records: readonly LeadImportRecord[],
  existing: readonly ExistingClient[],
  errors: readonly ImportRowError[] = [],
): ImportPlan {
  const byIntake = new Map<string, string>();
  const byEmail = new Map<string, string>();
  for (const row of existing) {
    if (row.intakeRef) byIntake.set(row.intakeRef.trim().toLowerCase(), row.id);
    if (row.email) byEmail.set(row.email.trim().toLowerCase(), row.id);
  }

  const seen = new Set<string>();
  const actions: ImportAction[] = [];

  for (const record of records) {
    const intakeKey = record.intakeRef?.trim().toLowerCase() ?? null;
    const emailKey = record.email.trim().toLowerCase();

    const matchedId = (intakeKey ? byIntake.get(intakeKey) : undefined) ?? byEmail.get(emailKey);
    const matchedOn: "intakeRef" | "email" =
      intakeKey && byIntake.has(intakeKey) ? "intakeRef" : "email";

    const dedupeKey = intakeKey ? `intake:${intakeKey}` : `email:${emailKey}`;
    if (seen.has(dedupeKey)) {
      actions.push({ kind: "skip", record, matchedOn: intakeKey ? "intakeRef" : "email" });
      continue;
    }
    seen.add(dedupeKey);
    // An email-matched row also claims its email key, so a later row carrying only that
    // email cannot create a duplicate alongside the update we just planned.
    if (intakeKey) seen.add(`email:${emailKey}`);

    if (matchedId) {
      actions.push({ kind: "update", clientId: matchedId, record, matchedOn });
    } else {
      actions.push({ kind: "create", record });
    }
  }

  return {
    actions,
    creates: actions.filter((action) => action.kind === "create").length,
    updates: actions.filter((action) => action.kind === "update").length,
    skipped: actions.filter((action) => action.kind === "skip").length,
    errors: [...errors],
  };
}

/**
 * Columns to write for one record. `intakeRef` is only ever set, never cleared — the
 * whole point of the field is that NOVA's numbering survives a re-import from a sheet
 * that happens to have dropped the column.
 */
export function updateValuesFor(record: LeadImportRecord) {
  const values: Record<string, string | null> = {
    displayName: record.displayName,
    email: record.email,
    source: record.source,
  };
  const optional = {
    phone: record.phone,
    serviceType: record.serviceType,
    edd: record.edd,
    city: record.city,
    postalCode: record.postalCode,
    hospital: record.hospital,
    assignedProvider: record.assignedProvider,
    insuranceProvider: record.insuranceProvider,
    consultDate: record.consultDate,
    followUpDueOn: record.followUpDueOn,
    intakeRef: record.intakeRef,
  };
  for (const [key, value] of Object.entries(optional)) {
    if (value !== null) values[key] = value;
  }
  values.insurance = record.insurance;
  return values;
}

/** Human summary for the import screen. */
export function planSummary(plan: ImportPlan): string {
  const parts = [
    `${plan.creates} new`,
    `${plan.updates} updated`,
    plan.skipped > 0 ? `${plan.skipped} duplicate in file` : null,
    plan.errors.length > 0 ? `${plan.errors.length} skipped with errors` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

/** Source label for the import screen, so the word matches the picker. */
export const IMPORT_SOURCE_LABEL = LEAD_SOURCE_LABELS[IMPORT_SOURCE];
