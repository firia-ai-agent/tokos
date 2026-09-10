/**
 * The terms-of-service gate on an invite accept (TOK-57).
 *
 * NOVA hands the accept link to people who do not work for Tokos yet — a doula joining
 * an agency, a family opening a portal. Before TOK-57 the form took a name and a password
 * and made a membership, so nobody ever said yes to anything. The founder's ask is one
 * line: "have a checkbox that they have to accept the terms and services to accept their
 * Tokos invite."
 *
 * Everything here is pure so the rule is testable without a database. The page draws the
 * checkbox from these constants and the server action refuses on the same predicate, so
 * a hand-rolled POST that omits the box is refused by the same sentence the form shows.
 */

/** Where the public terms live. A real route in this app, not an off-site placeholder. */
export const TOS_PATH = "/legal/terms";

/** Bumped when the terms change materially; stored alongside the acceptance timestamp. */
export const TOS_VERSION = "2026-09-10";

/** The form field. One name, read the same way by the checkbox and the action. */
export const TOS_FIELD = "acceptedTos";

/** The label next to the checkbox, so the page and the tests cannot drift. */
export const TOS_CHECKBOX_LABEL = "I accept the Tokos Terms of Service";

/**
 * Which invite kinds must tick it. Both, deliberately: a family accepting a portal is
 * agreeing to the same terms as the doula who invited her, and a rule with one exception
 * is a rule someone will get wrong later.
 */
export const TOS_REQUIRED_INVITE_KINDS = ["staff", "client"] as const;

export function tosRequiredFor(kind: string | null | undefined): boolean {
  return (TOS_REQUIRED_INVITE_KINDS as readonly string[]).includes(String(kind ?? "staff"));
}

/**
 * A checkbox posts `"on"` when ticked and nothing at all when it is not, so anything
 * falsy — including the literal strings a hand-built POST would reach for — is a no.
 */
export function acceptedTos(raw: FormDataEntryValue | string | null | undefined): boolean {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "") return false;
  return value === "on" || value === "true" || value === "yes" || value === "1";
}

export type TosGateInput = {
  /** `staff` or `client`, from the invite row — never from the posted form. */
  kind: string | null | undefined;
  /** The raw posted field. */
  posted: FormDataEntryValue | string | null | undefined;
};

export type TosGateResult = { ok: true; acceptedAt: null } | { ok: false; reason: "tos" };

/**
 * The whole gate. Returns a reason rather than throwing so the action can send the
 * invitee back to their own link with a message instead of a 500.
 */
export function tosGate(input: TosGateInput): TosGateResult {
  if (!tosRequiredFor(input.kind)) return { ok: true, acceptedAt: null };
  return acceptedTos(input.posted) ? { ok: true, acceptedAt: null } : { ok: false, reason: "tos" };
}

/** What gets written when the box was ticked. Version travels with the timestamp. */
export function tosAcceptance(now: Date = new Date()) {
  return { tosAcceptedAt: now, tosVersion: TOS_VERSION };
}
