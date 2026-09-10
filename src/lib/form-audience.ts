/**
 * Who a form template is written for (TOK-50).
 *
 * Dubsado's own crawl showed the bug this exists to prevent: "Birth Doula Postpartum
 * Visit" and "Senior Birth Team Postpartum Check-In" sat in the *client's* Incomplete
 * list while their copy asked the reader to "complete your postpartum visit with the
 * client". A family opening her portal met someone else's homework, in someone else's
 * voice, and could not finish it.
 *
 * So a template carries an audience, and the whole product reads it from here:
 *
 * - `family` — the portal may hold it. Getting-to-know-you, birth preferences, the
 *   partner's expectations, the intake worksheet.
 * - `staff`  — doula/agency work. Prenatal visit notes, postpartum visit, the Birth Log.
 *   Never assignable to a family portal, never counted on a family's checklist.
 *
 * The rule is enforced three deep on purpose: the picker only offers family templates,
 * the assign action refuses a staff one, and the portal reads filter on audience anyway.
 * A bad row written by an older build still cannot reach a family.
 */

export const FORM_AUDIENCES = ["family", "staff"] as const;
export type FormAudience = (typeof FORM_AUDIENCES)[number];

/** The default an unmarked template gets: the column defaults to `family` in the DB. */
export const DEFAULT_FORM_AUDIENCE: FormAudience = "family";

export function isFormAudience(value: unknown): value is FormAudience {
  return typeof value === "string" && (FORM_AUDIENCES as readonly string[]).includes(value);
}

/**
 * Read any stored value as one of the two. Anything unrecognised reads as `family`,
 * matching the column default — the guards below are what keep a staff form off the
 * portal, and they key off an explicit `staff`, so a typo can never quietly hide a
 * family's own form from her.
 */
export function normalizeFormAudience(value: unknown): FormAudience {
  return isFormAudience(value) ? value : DEFAULT_FORM_AUDIENCE;
}

type AudienceCarrier = { audience?: string | null };

export function isFamilyAudience(template: AudienceCarrier | string | null | undefined): boolean {
  const raw = typeof template === "string" ? template : template?.audience;
  return normalizeFormAudience(raw) === "family";
}

export function isStaffAudience(template: AudienceCarrier | string | null | undefined): boolean {
  return !isFamilyAudience(template);
}

/** The only list a "Send a form" picker may render. */
export function familyTemplates<T extends AudienceCarrier>(templates: readonly T[]): T[] {
  return templates.filter((template) => isFamilyAudience(template));
}

/** The staff shelf — visit notes and logs, shown on `/doula/forms` with no portal CTA. */
export function staffTemplates<T extends AudienceCarrier>(templates: readonly T[]): T[] {
  return templates.filter((template) => isStaffAudience(template));
}

/**
 * Server-side gate for every assign path. Returns false rather than throwing so a batch
 * can skip one bad id and still send the rest; the single-assign action turns a false
 * into a redirect the doula can read.
 */
export function assignableToFamily(
  template: (AudienceCarrier & { id?: string }) | null | undefined,
): boolean {
  return Boolean(template) && isFamilyAudience(template);
}

/** Throwing variant, for call sites where a staff template is a programming error. */
export function assertAssignableToFamily<T extends AudienceCarrier & { title?: string }>(
  template: T | null | undefined,
): T {
  if (!template) throw new Error("form audience: no template");
  if (!assignableToFamily(template)) {
    throw new Error(
      `form audience: "${template.title ?? "template"}" is a staff form and cannot go to a family portal`,
    );
  }
  return template;
}

/** Staff-side chip on `/doula/forms`, so a doula can see why a form has no send button. */
export function audienceLabel(audience: unknown): string {
  return normalizeFormAudience(audience) === "staff" ? "Staff only" : "Family";
}
