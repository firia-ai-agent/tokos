/**
 * The chart, as a family may read it (TOK-45).
 *
 * One rule, and it is the whole file: `clientVisibleFieldKeys` decides which answers exist
 * here. Nothing else filters — not this module, not the page. A second filter is a second
 * opinion, and the moment there are two, one of them is out of date and the other is the
 * one that leaked a dilation curve. Everything below is projection: which groups have
 * anything left, and how a stored value reads as a sentence.
 *
 * Labels come from `lib/chart/field-defs`, with a small family-safe remap for chart-group
 * chrome ("medical choices" / "Newborn procedures") that would otherwise read as hospital
 * paperwork on Passport. The doula signature block never reaches here — that strip lives in
 * `clientVisibleFieldKeys`. No Birth Log narration is written here; Vera holds that until
 * the portal form crawl lands. A birth log opened to `shared_summary` renders its own
 * non-clinical field labels only.
 */

import {
  chartDocument,
  type ChartAnswerValue,
  type ChartAnswers,
  type ChartDocumentKey,
  type ChartFieldDef,
} from "@/lib/chart/field-defs";
import { clientVisibleFieldKeys, type SharePolicy } from "@/lib/chart/share-policy";
import { isSharedWithClient } from "@/lib/chart/acl";

export type PassportField = {
  key: string;
  label: string;
  /** Already rendered: option labels resolved, lists joined. */
  value: string;
  help?: string;
};

export type PassportSection = {
  key: string;
  label: string;
  fields: PassportField[];
};

/** A chart row as the portal loader reads it, before any of it is shown. */
export type PassportRecord = {
  id: string;
  document: ChartDocumentKey;
  status: string;
  sharePolicy: string;
  signedAt: Date | null;
  answers: ChartAnswers;
};

export type PassportEntry = {
  id: string;
  document: ChartDocumentKey;
  /** The document's own label — "Birth preferences & care plan". */
  label: string;
  signedAt: Date | null;
  sections: PassportSection[];
};

function optionLabel(field: ChartFieldDef, value: string): string {
  return field.options?.find((option) => option.value === value)?.label ?? value;
}

/**
 * One stored answer as a family reads it. Returns "" for anything with nothing to say —
 * unanswered, blank, or a grid.
 *
 * Grids render empty on purpose. Every grid this product has is the Birth Log's
 * dilation/effacement/station table, which `clientVisibleFieldKeys` already refuses; this
 * is the belt to that braces, so a grid that somehow arrived here still draws nothing.
 */
export function formatChartAnswer(
  field: ChartFieldDef,
  value: ChartAnswerValue | undefined,
): string {
  if (value === undefined || value === null) return "";
  if (field.type === "grid") return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => optionLabel(field, entry))
      .join(" · ");
  }
  const text = String(value).trim();
  if (!text) return "";
  return field.options ? optionLabel(field, text) : text;
}

/**
 * Form group / field labels that read as hospital chart chrome on the family Passport.
 * Preference keys stay (Faith K1); only the wording softens. Staff forms keep field-defs.
 */
const FAMILY_SAFE_GROUP_LABELS: Readonly<Record<string, string>> = {
  early_labor_medical: "Early labor preferences",
  newborn_procedures: "Newborn care preferences",
};

const FAMILY_SAFE_FIELD_LABELS: Readonly<Record<string, string>> = {
  early_labor_medical: "Early labor preferences",
  newborn_procedures: "Newborn care preferences",
};

/**
 * The client-visible answers of one document, grouped as the form groups them. Groups with
 * nothing left in them are dropped rather than rendered as empty headings. Signature /
 * attestation never arrives here — `clientVisibleFieldKeys` already strips that block.
 */
export function passportSections(
  document: ChartDocumentKey,
  policy: SharePolicy,
  answers: ChartAnswers,
): PassportSection[] {
  const visible = new Set(clientVisibleFieldKeys(document, policy));
  return chartDocument(document).groups.flatMap((group) => {
    if (group.key === "signature") return [];
    const fields = group.fields.flatMap((field) => {
      if (!visible.has(field.key)) return [];
      const value = formatChartAnswer(field, answers[field.key]);
      if (!value) return [];
      return [
        {
          key: field.key,
          label: FAMILY_SAFE_FIELD_LABELS[field.key] ?? field.label,
          value,
          help: field.help,
        },
      ];
    });
    if (fields.length === 0) return [];
    return [
      {
        key: group.key,
        label: FAMILY_SAFE_GROUP_LABELS[group.key] ?? group.label,
        fields,
      },
    ];
  });
}

/** Just the answer map, stripped — what an export for a family may contain. */
export function clientVisibleAnswers(
  document: ChartDocumentKey,
  policy: SharePolicy,
  answers: ChartAnswers,
): ChartAnswers {
  const visible = clientVisibleFieldKeys(document, policy);
  const out: ChartAnswers = {};
  for (const key of visible) {
    const value = answers[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/**
 * The rows a family's portal may render, in the order they were handed. A row that is not
 * both signed and open is dropped here even if a caller read it by mistake — the loader
 * filters in SQL too, and neither filter is the one that is allowed to be forgotten.
 */
export function passportEntries(records: readonly PassportRecord[]): PassportEntry[] {
  return records.flatMap((record) => {
    if (!isSharedWithClient(record)) return [];
    const sections = passportSections(
      record.document,
      record.sharePolicy as SharePolicy,
      record.answers,
    );
    if (sections.length === 0) return [];
    return [
      {
        id: record.id,
        document: record.document,
        label: chartDocument(record.document).label,
        signedAt: record.signedAt,
        sections,
      },
    ];
  });
}
