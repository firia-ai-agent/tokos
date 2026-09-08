/**
 * What the client rail says (TOK-39 E4).
 *
 * Dubsado's portal wears NOVA's name and calls itself "Birth Prep". Tokos wore its own:
 * the rail read **TOKOS** in tracked caps with the practice demoted to an 11px hint. A
 * family did not buy Tokos, and the product name over the practice name is the same
 * mistake as showing them "new lead" — true to us, wrong for them.
 *
 * So the client shell leads with the practice and keeps Tokos to the staff shells. The
 * rail word has to fit one 18px line at 0.28em tracking in a 248px rail, so a long
 * portal name splits: "NOVA Birth Prep" becomes **NOVA** over "Birth Prep". A name that
 * cannot be split honestly is shown whole rather than truncated into nonsense.
 */

/** Used when an org has no portal name yet — never the product name. */
export const DEFAULT_PORTAL_NAME = "Birth Prep";

/** Longest string that still fits the rail's tracked caps without wrapping. */
const RAIL_MAX = 12;

export type ClientChrome = {
  /** The tracked-caps word at the top of the rail. */
  brand: string;
  /** The coral line under it, or undefined when the name is one word. */
  hint?: string;
  /** The full portal name, for `personMeta` and page headers. */
  portalName: string;
};

export function clientChrome(
  portalName: string | null | undefined,
  orgName?: string | null,
): ClientChrome {
  const full = String(portalName ?? "").trim() || String(orgName ?? "").trim() || DEFAULT_PORTAL_NAME;

  if (full.length <= RAIL_MAX) return { brand: full, portalName: full };

  const [first, ...rest] = full.split(/\s+/);
  // Split only when the leading word is a real word that fits and something is left to
  // say under it — otherwise the whole name goes up and wraps rather than lying.
  if (first && first.length >= 2 && first.length <= RAIL_MAX && rest.length > 0) {
    return { brand: first, hint: rest.join(" "), portalName: full };
  }
  return { brand: full, portalName: full };
}
