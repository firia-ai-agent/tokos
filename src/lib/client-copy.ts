/**
 * The two things Home says back after a family does something (TOK-39 E6).
 *
 * These used to be template literals inlined in `portal/page.tsx`, which is how the
 * signed banner ended up reciting the Complete rule — "your care is booked once the fit
 * consult is confirmed and the first payment clears" — at the one moment a family is
 * feeling something rather than reading policy. Copy that lives in a page gets written
 * by whoever is editing the page.
 *
 * So it lives here, next to the assigned doula's first name it has to carry, and the
 * page renders whatever this returns. Both lines say the same two facts as the gate in
 * `resource-gate.ts` — fit consult, first payment — in the order the family is living
 * them, and neither promises the other half is done.
 */

export type PortalBanner = {
  /** Stable key for React and for tests; also the query flag that raised it. */
  key: "signed" | "paid";
  text: string;
};

/** After signing: money is the remaining half, and fit is still the doula's call. */
export function signedBannerCopy(doulaFirstName: string): string {
  return `Thanks — ${doulaFirstName} still confirms fit, and payment finishes it.`;
}

/** After paying: the money half is done, so only the consult is still outstanding. */
export function paidBannerCopy(doulaFirstName: string): string {
  return `Payment received. Once your fit consult with ${doulaFirstName} is confirmed, your care is booked.`;
}

/**
 * Home reaches here once with its `?signed`/`?paid` flags and renders the result. Both
 * can be true — a family who signs and pays in one sitting lands back with both — and
 * they read in the order they happened.
 */
export function portalBanners(
  flags: { signed?: unknown; paid?: unknown },
  doulaFirstName: string,
): PortalBanner[] {
  const banners: PortalBanner[] = [];
  if (flags.signed) banners.push({ key: "signed", text: signedBannerCopy(doulaFirstName) });
  if (flags.paid) banners.push({ key: "paid", text: paidBannerCopy(doulaFirstName) });
  return banners;
}
