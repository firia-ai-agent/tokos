/**
 * The rate card each seeded provider profile starts with (TOK-74).
 *
 * TOK-57 moved rates off a hand-typed sentence and onto a structured grid, but the seed
 * kept writing only the derived display strings — so every seeded doula opened
 * `/doula/profile` to an empty grid: nothing ticked, every amount 0, no service area.
 * The public page still read the old label, which made it look fine from the outside and
 * broken from the inside. A demo walk that starts on "you have no rates" is not a demo.
 *
 * These are the *starting* cards, not the truth: the moment a doula saves the form,
 * `saveProfileAction` overwrites them with what she typed. They live next to
 * `demo-logins` rather than inside the seed script because the live ensure
 * (`scripts/ensure-provider-rates.ts`) has to write exactly the same thing, and a demo
 * database that disagrees with a fresh seed is the bug this ticket is about.
 *
 * Keyed by profile slug because that is the one handle both writers hold: the seed writes
 * it, and the ensure script looks the row up by it.
 */

import type { ProviderRateCard } from "@/lib/provider-rates";

export const DEMO_RATE_CARDS = {
  /**
   * Maya leads with births — the package price her public page has always advertised —
   * and takes postpartum hours around them. Two rates, so the derived summary reads both
   * out in full instead of collapsing to "and 2 more services".
   */
  "maya-chen": {
    address: "Arlington, VA",
    zip: "22203",
    radiusMiles: 35,
    rates: [
      {
        service: "birth_support",
        amountCents: 280_000,
        unit: "flat",
        note: "Two prenatals, the birth, and a postpartum visit",
      },
      { service: "postpartum", amountCents: 5_500, unit: "hourly" },
    ],
  },
  /**
   * Priya works the nights and the early weeks, and stands in on births as backup — the
   * three shapes the founder named: a flat labor fee, an hourly overnight, and a flat
   * postpartum visit. Overnight is her cheapest rate, so the derived summary still opens
   * with the "$45/hr" her page has always led with.
   */
  "priya-raman": {
    address: "Arlington, VA",
    zip: "22201",
    radiusMiles: 25,
    rates: [
      {
        service: "birth_support",
        amountCents: 160_000,
        unit: "flat",
        note: "Backup births for families I have already met",
      },
      {
        service: "overnight",
        amountCents: 4_500,
        unit: "hourly",
        note: "Ten-hour nights, two nights a week minimum",
      },
      {
        service: "postpartum",
        amountCents: 24_000,
        unit: "flat",
        note: "One four-hour daytime visit",
      },
    ],
  },
  /**
   * Cedar's own doula, on the second org. She had the same empty grid, and leaving one
   * provider on a hand-typed label while the other two derive theirs is exactly the drift
   * TOK-57 set out to remove.
   */
  "sam-ortega": {
    address: "Richmond, VA",
    zip: "23220",
    radiusMiles: 40,
    rates: [
      {
        service: "birth_support",
        amountCents: 240_000,
        unit: "flat",
        note: "Includes a birth plan session and one home visit after",
      },
      { service: "childbirth_class", amountCents: 20_000, unit: "flat" },
    ],
  },
} as const satisfies Record<string, ProviderRateCard>;

export type DemoProfileSlug = keyof typeof DEMO_RATE_CARDS;

export const DEMO_PROFILE_SLUGS = Object.keys(DEMO_RATE_CARDS) as DemoProfileSlug[];

export function demoRateCard(slug: DemoProfileSlug): ProviderRateCard {
  return DEMO_RATE_CARDS[slug];
}
