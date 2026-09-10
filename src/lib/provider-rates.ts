/**
 * Structured rates and a real service area for a provider profile (TOK-57).
 *
 * The founder's note on `/doula/profile`: "instead of it being a long text box, have it be
 * something a little bit more standardized where you put in different services, and then
 * they can select which services they offer and put their rate. They can also select if
 * it's hourly, if it's per day, or if it's a set amount for a specific task end-to-end."
 * And: "allow them to put in an address/zip code for the service area and put in the mile
 * radius that they are willing to travel."
 *
 * So a rate is three facts — which service, how much, on what basis — not a sentence. The
 * services come from `@/lib/lead-fields`, the same list the lead record's Service type
 * picker uses, because a doula who offers "Overnight" and a family who asks for
 * "Overnight" have to mean the same thing for matching to ever work.
 *
 * `ratesLabel` and `serviceArea` stay on the row as *derived* display strings. They are
 * what `/p/[slug]` and the care-team card already read, and rebuilding them on every save
 * keeps those surfaces true without a second source of truth to drift.
 *
 * Money is cents, integer, everywhere — the same rule the invoices carry.
 */

import { SERVICE_TYPES, SERVICE_TYPE_LABELS, type ServiceType } from "@/lib/lead-fields";

/* ------------------------------------------------------------------------ units ---- */

/** The three bases the founder named. Nothing else is offerable. */
export const RATE_UNITS = ["hourly", "per_day", "flat"] as const;
export type RateUnit = (typeof RATE_UNITS)[number];

export const RATE_UNIT_LABELS: Record<RateUnit, string> = {
  hourly: "Per hour",
  per_day: "Per day",
  flat: "Flat rate",
};

/** How the amount reads once it is written out: "$45/hr", "$2,800 flat". */
export const RATE_UNIT_SUFFIXES: Record<RateUnit, string> = {
  hourly: "/hr",
  per_day: "/day",
  flat: " flat",
};

export const RATE_UNIT_OPTIONS: Array<{ value: RateUnit; label: string }> = RATE_UNITS.map(
  (value) => ({ value, label: RATE_UNIT_LABELS[value] }),
);

export function normalizeRateUnit(raw: unknown): RateUnit {
  const value = String(raw ?? "").trim().toLowerCase();
  return (RATE_UNITS as readonly string[]).includes(value) ? (value as RateUnit) : "hourly";
}

/* ------------------------------------------------------------------------ rates ---- */

export type ProviderRate = {
  service: ServiceType;
  amountCents: number;
  unit: RateUnit;
  /** Optional one-line qualifier — "includes two prenatal visits". Never a paragraph. */
  note?: string;
};

/** Longest note we will keep. A rate card is a price list, not a bio. */
export const RATE_NOTE_MAX = 90;

/** Form field names, in one place so the page and the action cannot drift. */
export const RATE_FIELDS = {
  offered: (service: string) => `rate_offered_${service}`,
  amount: (service: string) => `rate_amount_${service}`,
  unit: (service: string) => `rate_unit_${service}`,
  note: (service: string) => `rate_note_${service}`,
} as const;

export const SERVICE_AREA_FIELDS = {
  address: "serviceAreaAddress",
  zip: "serviceAreaZip",
  radius: "travelRadiusMiles",
} as const;

function isServiceType(value: unknown): value is ServiceType {
  return (SERVICE_TYPES as readonly string[]).includes(String(value ?? ""));
}

/**
 * "2,800", "$2,800.00" and "2800" are all the same money. A blank, a negative, or
 * anything that is not a number at all is no rate rather than a rate of zero — a doula
 * who ticks a service and leaves the amount empty has not published a price.
 */
export function parseAmountCents(raw: unknown): number | null {
  const cleaned = String(raw ?? "").replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

export function formatAmount(cents: number): string {
  const dollars = cents / 100;
  return dollars % 1 === 0
    ? `$${dollars.toLocaleString("en-US")}`
    : `$${dollars.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** The amount as it goes back into the form's number input: dollars, no symbol. */
export function amountInputValue(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return "";
  const dollars = cents / 100;
  return dollars % 1 === 0 ? String(dollars) : dollars.toFixed(2);
}

export function serviceLabel(service: ServiceType): string {
  return SERVICE_TYPE_LABELS[service];
}

/** One rate, written out: "Overnight — $45/hr". */
export function formatRate(rate: ProviderRate): string {
  return `${serviceLabel(rate.service)} — ${formatAmount(rate.amountCents)}${
    RATE_UNIT_SUFFIXES[rate.unit]
  }`;
}

/**
 * Reads the rate grid off a posted form. A service counts only when its box is ticked
 * *and* it carries a usable amount, so a half-filled row is dropped rather than published
 * at $0. Rows come back in `SERVICE_TYPES` order whatever order the browser posted them.
 */
export function parseRatesForm(form: {
  get(name: string): FormDataEntryValue | null;
}): ProviderRate[] {
  const rates: ProviderRate[] = [];
  for (const service of SERVICE_TYPES) {
    if (!form.get(RATE_FIELDS.offered(service))) continue;
    const amountCents = parseAmountCents(form.get(RATE_FIELDS.amount(service)));
    if (amountCents == null) continue;
    const note = String(form.get(RATE_FIELDS.note(service)) ?? "")
      .trim()
      .slice(0, RATE_NOTE_MAX);
    rates.push({
      service,
      amountCents,
      unit: normalizeRateUnit(form.get(RATE_FIELDS.unit(service))),
      ...(note ? { note } : {}),
    });
  }
  return rates;
}

/**
 * Defensive read of whatever is in the jsonb column. Rows written before TOK-57 hold
 * `null`; a row hand-edited into nonsense should render as "no rates yet", never crash a
 * public profile page.
 */
export function parseRatesJson(raw: unknown): ProviderRate[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const rates: ProviderRate[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    if (!isServiceType(row.service)) continue;
    if (seen.has(row.service)) continue;
    const amountCents = Number(row.amountCents);
    if (!Number.isFinite(amountCents) || amountCents <= 0) continue;
    const note = typeof row.note === "string" ? row.note.trim().slice(0, RATE_NOTE_MAX) : "";
    seen.add(row.service);
    rates.push({
      service: row.service,
      amountCents: Math.round(amountCents),
      unit: normalizeRateUnit(row.unit),
      ...(note ? { note } : {}),
    });
  }
  return sortRates(rates);
}

/** Published order follows the service list, so two doulas' cards read alike. */
export function sortRates(rates: readonly ProviderRate[]): ProviderRate[] {
  const order = new Map(SERVICE_TYPES.map((service, index) => [service, index]));
  return [...rates].sort(
    (a, b) => (order.get(a.service) ?? 99) - (order.get(b.service) ?? 99),
  );
}

/**
 * The derived one-liner `/p/[slug]` and the care-team card show. Two rates read in full;
 * more than that leads with the cheapest and counts the rest, because a public page is a
 * doorway, not a price sheet.
 */
export function ratesSummary(rates: readonly ProviderRate[]): string {
  const sorted = sortRates(rates);
  if (sorted.length === 0) return "";
  if (sorted.length <= 2) return sorted.map(formatRate).join(" · ");
  const cheapest = [...sorted].sort((a, b) => a.amountCents - b.amountCents)[0];
  const rest = sorted.length - 1;
  return `${formatRate(cheapest)} · ${rest} more service${rest === 1 ? "" : "s"}`;
}

/* ----------------------------------------------------------------- service area ---- */

/** How far anyone may claim to travel. A radius, not a fantasy. */
export const TRAVEL_RADIUS_MAX_MILES = 250;

export type ServiceAreaInput = {
  address?: string | null;
  zip?: string | null;
  radiusMiles?: number | null;
};

/** US 5-digit or ZIP+4, kept as typed minus the noise. Empty when it is not one. */
export function normalizeZip(raw: unknown): string {
  const value = String(raw ?? "").trim();
  const match = /^(\d{5})(?:[-\s]?(\d{4}))?$/.exec(value);
  if (!match) return "";
  return match[2] ? `${match[1]}-${match[2]}` : match[1];
}

/** Whole miles, clamped. Blank and zero both mean "not set" rather than "nowhere". */
export function parseRadiusMiles(raw: unknown): number | null {
  const cleaned = String(raw ?? "").replace(/[^\d.]/g, "");
  if (cleaned === "") return null;
  const value = Math.round(Number(cleaned));
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.min(value, TRAVEL_RADIUS_MAX_MILES);
}

export function formatRadius(miles: number | null | undefined): string {
  if (miles == null || miles <= 0) return "";
  return `${miles} mile${miles === 1 ? "" : "s"}`;
}

/**
 * The derived service-area sentence. A family reads "Arlington, VA 22201 · travels 25
 * miles" — a place and a distance, which is the question she is actually asking.
 */
export function serviceAreaSummary(input: ServiceAreaInput): string {
  const address = String(input.address ?? "").trim();
  const zip = normalizeZip(input.zip);
  const radius = formatRadius(input.radiusMiles ?? null);
  const place = [address, address.includes(zip) ? "" : zip].filter(Boolean).join(" ").trim();
  const parts = [place, radius ? `travels ${radius}` : ""].filter(Boolean);
  return parts.join(" · ");
}

/** True once there is something worth publishing — used to decide whether to derive. */
export function hasServiceArea(input: ServiceAreaInput): boolean {
  return serviceAreaSummary(input) !== "";
}
