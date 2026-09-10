import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEMO_PROFILE_SLUGS,
  DEMO_RATE_CARDS,
  demoRateCard,
  type DemoProfileSlug,
} from "@/lib/demo-rate-cards";
import { RATE_NOTE_MAX, parseRatesJson, rateCardColumns } from "@/lib/provider-rates";
import { SERVICE_TYPES } from "@/lib/lead-fields";

const seed = readFileSync(join(process.cwd(), "scripts", "seed.ts"), "utf8");
const ensure = readFileSync(
  join(process.cwd(), "scripts", "ensure-provider-rates.ts"),
  "utf8",
);

/** The slugs the seed actually publishes a provider profile for. */
function seededProfileSlugs(): string[] {
  return [...seed.matchAll(/slug: "([a-z-]+)",\n\s*headline:/g)].map((m) => m[1]);
}

describe("demo rate cards (TOK-74)", () => {
  it("gives every seeded provider a non-empty grid, Priya and Maya included", () => {
    for (const slug of DEMO_PROFILE_SLUGS) {
      const rates = demoRateCard(slug).rates;
      expect(rates.length, `${slug} should open her profile to real rates`).toBeGreaterThan(0);
    }
    expect(DEMO_PROFILE_SLUGS).toContain("priya-raman");
    expect(DEMO_PROFILE_SLUGS).toContain("maya-chen");
  });

  it("covers every provider profile the seed publishes", () => {
    expect([...seededProfileSlugs()].sort()).toEqual([...DEMO_PROFILE_SLUGS].sort());
  });

  it("survives the round trip the profile page reads them back through", () => {
    for (const slug of DEMO_PROFILE_SLUGS) {
      const card = demoRateCard(slug);
      const { ratesJson } = rateCardColumns(card);
      // `/doula/profile` renders `parseRatesJson(profile.ratesJson)`. A card that does not
      // come back out of that read is a card the doula still sees as 0/unchecked.
      expect(parseRatesJson(ratesJson)).toHaveLength(card.rates.length);
    }
  });

  it("prices every rate above zero on a real service, with a one-line note at most", () => {
    for (const slug of DEMO_PROFILE_SLUGS) {
      for (const rate of demoRateCard(slug).rates) {
        expect(SERVICE_TYPES).toContain(rate.service);
        expect(rate.amountCents).toBeGreaterThan(0);
        expect(Number.isInteger(rate.amountCents)).toBe(true);
        expect(rate.note?.length ?? 0).toBeLessThanOrEqual(RATE_NOTE_MAX);
      }
    }
  });

  it("never lists the same service twice on one card", () => {
    for (const slug of DEMO_PROFILE_SLUGS) {
      const services = demoRateCard(slug).rates.map((rate) => rate.service);
      expect(new Set(services).size).toBe(services.length);
    }
  });

  it("gives each provider a real service area — a zip and a radius, not just a sentence", () => {
    for (const slug of DEMO_PROFILE_SLUGS) {
      const columns = rateCardColumns(demoRateCard(slug));
      expect(columns.serviceAreaZip, `${slug} needs a parseable zip`).toMatch(/^\d{5}/);
      expect(columns.travelRadiusMiles ?? 0).toBeGreaterThan(0);
      expect(columns.serviceArea).toContain("travels");
    }
  });

  it("derives a rates label rather than leaving the public page blank", () => {
    for (const slug of DEMO_PROFILE_SLUGS) {
      expect(rateCardColumns(demoRateCard(slug)).ratesLabel).not.toBe("");
    }
  });

  it("keeps Priya's three shapes and still opens her label with the overnight rate", () => {
    const priya = demoRateCard("priya-raman");
    const units = new Set(priya.rates.map((rate) => rate.unit));
    expect(units).toContain("flat");
    expect(units).toContain("hourly");
    expect(priya.rates.map((rate) => rate.service)).toContain("overnight");
    // Three rates, so `ratesSummary` leads with the cheapest — which for Priya is the
    // "$45/hr" her page advertised before TOK-57 ever structured it.
    expect(rateCardColumns(priya).ratesLabel).toContain("$45/hr");
  });

  it("keeps Maya's birth package price the public page has always shown", () => {
    expect(rateCardColumns(demoRateCard("maya-chen")).ratesLabel).toContain("$2,800");
  });

  it("is what the seed writes, so a fresh database matches the live ensure", () => {
    for (const slug of DEMO_PROFILE_SLUGS) {
      expect(seed).toContain(`...rateCardColumns(demoRateCard("${slug}"))`);
    }
    // The hand-typed labels TOK-57 left behind are the bug: they made the public page look
    // priced while the grid underneath was empty.
    expect(seed).not.toContain("ratesLabel:");
    expect(seed).not.toContain("serviceArea:");
  });

  it("has a live ensure that only fills empty grids", () => {
    expect(ensure).toContain("parseRatesJson");
    expect(ensure).toContain("rateCardColumns");
    expect(ensure).toContain("DEMO_PROFILE_SLUGS");
  });

  it("exposes the same slugs through the map and the list", () => {
    expect(DEMO_PROFILE_SLUGS.sort()).toEqual(
      (Object.keys(DEMO_RATE_CARDS) as DemoProfileSlug[]).sort(),
    );
  });
});
