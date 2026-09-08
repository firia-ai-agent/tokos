/**
 * Org brand fields, cleaned before they reach the `organizations` row.
 *
 * Everything here renders somewhere a family sees — the portal header, a transactional
 * email footer — so the sanitiser is the boundary: a bad hex never becomes an inline
 * style, and the footer HTML is reduced to the handful of tags a footer actually needs.
 */

export const DEFAULT_PRIMARY_COLOR = "#2A7A78";

/** Zones the timezone picker offers. The column is free text; the form is not. */
export const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
] as const;

export type BrandInput = {
  portalName?: string | null;
  primaryColor?: string | null;
  websiteUrl?: string | null;
  onCallPhone?: string | null;
  footerHtml?: string | null;
  confidentialityBlurb?: string | null;
  timezone?: string | null;
};

export type BrandValues = {
  portalName: string;
  primaryColor: string;
  websiteUrl: string | null;
  onCallPhone: string | null;
  footerHtml: string | null;
  confidentialityBlurb: string | null;
  timezone: string;
};

/**
 * `#abc` and `#aabbcc` both come back as an expanded, upper-case `#AABBCC`. Anything
 * else — a named colour, a `javascript:` string, an empty box — falls back to the Teal
 * default rather than being written through to a style attribute.
 */
export function sanitizeHexColor(raw: string | null | undefined, fallback = DEFAULT_PRIMARY_COLOR) {
  const value = String(raw ?? "").trim();
  const short = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value);
  if (short) {
    const [, r, g, b] = short;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  const long = /^#?([0-9a-f]{6})$/i.exec(value);
  if (long) return `#${long[1]}`.toUpperCase();
  return fallback;
}

/** Only http(s) links leave the settings form; a `javascript:` URL reads back as null. */
export function sanitizeUrl(raw: string | null | undefined): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

/** Digits, spaces, and the usual phone punctuation. Nothing else survives. */
export function sanitizePhone(raw: string | null | undefined): string | null {
  const value = String(raw ?? "")
    .replace(/[^0-9+()\-. x]/gi, "")
    .trim();
  return value || null;
}

const FOOTER_ALLOWED = new Set(["b", "strong", "i", "em", "br", "p", "span", "a", "small"]);

/**
 * The footer is authored by the practice owner, but it is still rendered into email, so
 * it is narrowed to inline formatting: script/style blocks lose their contents entirely,
 * every other unlisted tag is unwrapped, and `on*=` / `javascript:` attributes are cut.
 */
export function sanitizeFooterHtml(raw: string | null | undefined): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const stripped = value
    .replace(/<\s*(script|style|iframe|object|embed)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed)\b[^>]*>/gi, "")
    .replace(/<\/?([a-z][a-z0-9]*)\b([^>]*)>/gi, (match, tag: string, attrs: string) => {
      if (!FOOTER_ALLOWED.has(tag.toLowerCase())) return "";
      const safeAttrs = attrs
        .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
        .replace(/\s(href|src)\s*=\s*("|')?\s*javascript:[^"'>]*("|')?/gi, "");
      return match.startsWith("</") ? `</${tag.toLowerCase()}>` : `<${tag.toLowerCase()}${safeAttrs}>`;
    })
    .trim();
  return stripped || null;
}

function plainText(raw: string | null | undefined, limit: number): string | null {
  const value = String(raw ?? "")
    .replace(/<[^>]*>/g, "")
    .trim()
    .slice(0, limit);
  return value || null;
}

export function sanitizeTimezone(raw: string | null | undefined, fallback = "America/New_York") {
  const value = String(raw ?? "").trim();
  return (TIMEZONES as readonly string[]).includes(value) ? value : fallback;
}

/**
 * One pass over the whole settings form. `current` supplies the fallbacks, so clearing a
 * box means "no value" for the optional fields but never blanks the portal name, the
 * colour, or the timezone the rest of the app reads.
 */
export function sanitizeBrand(input: BrandInput, current: BrandValues): BrandValues {
  return {
    portalName: plainText(input.portalName, 120) ?? current.portalName,
    primaryColor: sanitizeHexColor(input.primaryColor, current.primaryColor),
    websiteUrl: sanitizeUrl(input.websiteUrl),
    onCallPhone: sanitizePhone(input.onCallPhone),
    footerHtml: sanitizeFooterHtml(input.footerHtml),
    confidentialityBlurb: plainText(input.confidentialityBlurb, 600),
    timezone: sanitizeTimezone(input.timezone, current.timezone),
  };
}

/** Readable ink for a swatch, so the preview chip stays legible on any brand colour. */
export function contrastInk(hex: string): "#0F2E2D" | "#FFFFFF" {
  const value = sanitizeHexColor(hex);
  const r = parseInt(value.slice(1, 3), 16);
  const g = parseInt(value.slice(3, 5), 16);
  const b = parseInt(value.slice(5, 7), 16);
  // Rec. 601 luma — good enough to pick between the two inks in the palette.
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luma > 0.6 ? "#0F2E2D" : "#FFFFFF";
}
