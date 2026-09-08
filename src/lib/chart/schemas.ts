/**
 * Zod validators derived from the chart field defs (TOK-44).
 *
 * Nothing here restates a field: the shape, the option lists and the required flags all
 * come from `lib/chart/field-defs`, so adding a question to the inventory adds it to
 * validation for free — and an answer key that is not in the defs fails to parse, which is
 * what keeps `answers` jsonb from drifting into a free-form bag.
 *
 * Two modes, matching how the Dubsado form behaves:
 *  - `draft` — anything may be blank. A doula fills a birth log over hours, not at once.
 *  - `signed` — every starred field must be answered. This is "Show missing fields",
 *    and passing it is the precondition for sign → lock.
 */
import { z } from "zod";

import {
  chartFields,
  type ChartAnswers,
  type ChartDocumentKey,
  type ChartFieldDef,
} from "@/lib/chart/field-defs";

export const CHART_PARSE_MODES = ["draft", "signed"] as const;
export type ChartParseMode = (typeof CHART_PARSE_MODES)[number];

const optionValues = (field: ChartFieldDef): [string, ...string[]] => {
  const values = (field.options ?? []).map((option) => option.value);
  if (values.length === 0) throw new Error(`chart field "${field.key}" has no options`);
  return values as [string, ...string[]];
};

/** A grid row: every column optional, because a doula charts the row as it happens. */
function gridRowSchema(field: ChartFieldDef) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const column of field.columns ?? []) {
    const base =
      column.type === "select" ? z.enum(optionValues(column)) : z.string();
    shape[column.key] = base.or(z.literal("")).optional();
  }
  return z.object(shape).strict();
}

function fieldSchema(field: ChartFieldDef): z.ZodTypeAny {
  switch (field.type) {
    case "number":
      return z.number();
    case "boolean":
      return z.boolean();
    case "select":
      return z.enum(optionValues(field));
    case "multiselect":
      return z.array(z.enum(optionValues(field)));
    case "grid":
      return z.array(gridRowSchema(field)).max(field.rows ?? 0);
    default:
      return z.string();
  }
}

/** Answered means answered: a required text field is not satisfied by "". */
function requiredFieldSchema(field: ChartFieldDef): z.ZodTypeAny {
  switch (field.type) {
    case "multiselect":
      return z.array(z.enum(optionValues(field))).min(1);
    case "text":
    case "textarea":
    case "date":
    case "time":
    case "signature":
      return z.string().min(1);
    default:
      return fieldSchema(field);
  }
}

function documentSchema(document: ChartDocumentKey, mode: ChartParseMode) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of chartFields(document)) {
    if (mode === "signed" && field.required) {
      shape[field.key] = requiredFieldSchema(field);
      continue;
    }
    const base = fieldSchema(field);
    // Blank is how a UI says "not answered yet"; only drafts and optional fields take it.
    shape[field.key] = (
      field.type === "select" || field.type === "text" || field.type === "textarea" ||
      field.type === "date" || field.type === "time" || field.type === "signature"
        ? base.or(z.literal(""))
        : base
    ).optional();
  }
  return z.object(shape).strict();
}

const cache = new Map<string, z.ZodTypeAny>();

/**
 * Validator for one document in one mode. Cached, since the shape is derived from static
 * defs and TOK-43 will ask for it on every keystroke-shaped save.
 */
export function chartAnswerSchema(document: ChartDocumentKey, mode: ChartParseMode) {
  const cacheKey = `${document}:${mode}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;
  const built = documentSchema(document, mode);
  cache.set(cacheKey, built);
  return built;
}

export const prenatalVisitDraftSchema = () => chartAnswerSchema("prenatal_visit", "draft");
export const prenatalVisitSignedSchema = () => chartAnswerSchema("prenatal_visit", "signed");
export const birthLogDraftSchema = () => chartAnswerSchema("birth_log", "draft");
export const birthLogSignedSchema = () => chartAnswerSchema("birth_log", "signed");
export const carePlanDraftSchema = () => chartAnswerSchema("care_plan", "draft");
export const carePlanSignedSchema = () => chartAnswerSchema("care_plan", "signed");

export function parseChartAnswers(
  document: ChartDocumentKey,
  mode: ChartParseMode,
  answers: unknown,
): ChartAnswers {
  return chartAnswerSchema(document, mode).parse(answers) as ChartAnswers;
}

/** Which starred fields are still blank — "Show missing fields", without throwing. */
export function missingRequiredFieldKeys(
  document: ChartDocumentKey,
  answers: ChartAnswers,
): string[] {
  return chartFields(document)
    .filter((field) => field.required)
    .filter((field) => !requiredFieldSchema(field).safeParse(answers[field.key]).success)
    .map((field) => field.key);
}
