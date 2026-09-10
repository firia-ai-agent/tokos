import { describe, expect, it } from "vitest";
import {
  RATE_FIELDS,
  TRAVEL_RADIUS_MAX_MILES,
  amountInputValue,
  formatAmount,
  formatRate,
  hasServiceArea,
  normalizeRateUnit,
  normalizeZip,
  parseAmountCents,
  parseRadiusMiles,
  parseRatesForm,
  parseRatesJson,
  ratesSummary,
  serviceAreaSummary,
  sortRates,
  type ProviderRate,
} from "./provider-rates";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
}

describe("rate amounts", () => {
  it("reads money the way a person types it", () => {
    expect(parseAmountCents("2800")).toBe(280000);
    expect(parseAmountCents("$2,800")).toBe(280000);
    expect(parseAmountCents(" 45.50 ")).toBe(4550);
  });

  it("treats blank, zero and nonsense as no rate rather than a free service", () => {
    expect(parseAmountCents("")).toBeNull();
    expect(parseAmountCents(null)).toBeNull();
    expect(parseAmountCents("0")).toBeNull();
    expect(parseAmountCents("-40")).toBeNull();
    expect(parseAmountCents("call me")).toBeNull();
  });

  it("round-trips through the form input", () => {
    expect(amountInputValue(280000)).toBe("2800");
    expect(amountInputValue(4550)).toBe("45.50");
    expect(amountInputValue(null)).toBe("");
    expect(parseAmountCents(amountInputValue(4550))).toBe(4550);
  });

  it("formats whole dollars without cents", () => {
    expect(formatAmount(280000)).toBe("$2,800");
    expect(formatAmount(4550)).toBe("$45.50");
  });
});

describe("rate units", () => {
  it("keeps the three the founder named and refuses the rest", () => {
    expect(normalizeRateUnit("hourly")).toBe("hourly");
    expect(normalizeRateUnit("per_day")).toBe("per_day");
    expect(normalizeRateUnit("flat")).toBe("flat");
    expect(normalizeRateUnit("per_minute")).toBe("hourly");
    expect(normalizeRateUnit(undefined)).toBe("hourly");
  });

  it("writes a rate as a person would read it", () => {
    expect(formatRate({ service: "overnight", amountCents: 4500, unit: "hourly" })).toBe(
      "Overnight / night nanny — $45/hr",
    );
    expect(formatRate({ service: "birth_support", amountCents: 280000, unit: "flat" })).toBe(
      "Birth support — $2,800 flat",
    );
    expect(formatRate({ service: "postpartum", amountCents: 32000, unit: "per_day" })).toBe(
      "Postpartum — $320/day",
    );
  });
});

describe("reading the rate grid off the form", () => {
  it("keeps only services that are ticked and priced", () => {
    const rates = parseRatesForm(
      form({
        [RATE_FIELDS.offered("birth_support")]: "on",
        [RATE_FIELDS.amount("birth_support")]: "2800",
        [RATE_FIELDS.unit("birth_support")]: "flat",
        // Ticked but no amount — half a row is not a published price.
        [RATE_FIELDS.offered("lactation")]: "on",
        [RATE_FIELDS.amount("lactation")]: "",
        // Priced but not ticked — she took it off her list.
        [RATE_FIELDS.amount("postpartum")]: "320",
      }),
    );
    expect(rates).toEqual([
      { service: "birth_support", amountCents: 280000, unit: "flat" },
    ]);
  });

  it("carries a short qualifier and truncates a paragraph", () => {
    const rates = parseRatesForm(
      form({
        [RATE_FIELDS.offered("birth_support")]: "on",
        [RATE_FIELDS.amount("birth_support")]: "2800",
        [RATE_FIELDS.unit("birth_support")]: "flat",
        [RATE_FIELDS.note("birth_support")]: "x".repeat(200),
      }),
    );
    expect(rates[0].note).toHaveLength(90);
  });

  it("returns rows in service order however the browser posted them", () => {
    const rates = parseRatesForm(
      form({
        [RATE_FIELDS.offered("overnight")]: "on",
        [RATE_FIELDS.amount("overnight")]: "45",
        [RATE_FIELDS.offered("birth_support")]: "on",
        [RATE_FIELDS.amount("birth_support")]: "2800",
      }),
    );
    expect(rates.map((rate) => rate.service)).toEqual(["birth_support", "overnight"]);
  });
});

describe("reading the rate grid back out of the column", () => {
  it("reads null and junk as no rates instead of throwing", () => {
    expect(parseRatesJson(null)).toEqual([]);
    expect(parseRatesJson("Birth package from $2,800")).toEqual([]);
    expect(parseRatesJson([{ service: "not_a_service", amountCents: 100 }])).toEqual([]);
    expect(parseRatesJson([{ service: "overnight", amountCents: "free" }])).toEqual([]);
  });

  it("drops a duplicated service and repairs a bad unit", () => {
    expect(
      parseRatesJson([
        { service: "overnight", amountCents: 4500, unit: "per_fortnight" },
        { service: "overnight", amountCents: 9900, unit: "hourly" },
      ]),
    ).toEqual([{ service: "overnight", amountCents: 4500, unit: "hourly" }]);
  });

  it("round-trips what the form produced", () => {
    const rates: ProviderRate[] = [
      { service: "birth_support", amountCents: 280000, unit: "flat" },
      { service: "overnight", amountCents: 4500, unit: "hourly" },
    ];
    expect(parseRatesJson(JSON.parse(JSON.stringify(rates)))).toEqual(rates);
  });
});

describe("the derived rates line", () => {
  it("is empty when there is nothing published", () => {
    expect(ratesSummary([])).toBe("");
  });

  it("reads both in full when there are two", () => {
    expect(
      ratesSummary([
        { service: "birth_support", amountCents: 280000, unit: "flat" },
        { service: "overnight", amountCents: 4500, unit: "hourly" },
      ]),
    ).toBe("Birth support — $2,800 flat · Overnight / night nanny — $45/hr");
  });

  it("leads with the cheapest and counts the rest when the list is long", () => {
    expect(
      ratesSummary([
        { service: "birth_support", amountCents: 280000, unit: "flat" },
        { service: "overnight", amountCents: 4500, unit: "hourly" },
        { service: "lactation", amountCents: 12000, unit: "flat" },
      ]),
    ).toBe("Overnight / night nanny — $45/hr · 2 more services");
  });

  it("sorts by the service list, not by price", () => {
    expect(
      sortRates([
        { service: "lactation", amountCents: 1, unit: "flat" },
        { service: "birth_support", amountCents: 2, unit: "flat" },
      ]).map((rate) => rate.service),
    ).toEqual(["birth_support", "lactation"]);
  });
});

describe("service area", () => {
  it("keeps a real zip and drops anything that is not one", () => {
    expect(normalizeZip("22201")).toBe("22201");
    expect(normalizeZip(" 22201-1234 ")).toBe("22201-1234");
    expect(normalizeZip("22201 1234")).toBe("22201-1234");
    expect(normalizeZip("Arlington")).toBe("");
    expect(normalizeZip("2220")).toBe("");
    expect(normalizeZip(null)).toBe("");
  });

  it("reads a travel radius in whole miles and caps the claim", () => {
    expect(parseRadiusMiles("25")).toBe(25);
    expect(parseRadiusMiles("25.6")).toBe(26);
    expect(parseRadiusMiles("  30 miles ")).toBe(30);
    expect(parseRadiusMiles("99999")).toBe(TRAVEL_RADIUS_MAX_MILES);
    expect(parseRadiusMiles("0")).toBeNull();
    expect(parseRadiusMiles("")).toBeNull();
  });

  it("writes a place and a distance, and never repeats the zip", () => {
    expect(
      serviceAreaSummary({ address: "Arlington, VA", zip: "22201", radiusMiles: 25 }),
    ).toBe("Arlington, VA 22201 · travels 25 miles");
    expect(
      serviceAreaSummary({ address: "Arlington, VA 22201", zip: "22201", radiusMiles: 25 }),
    ).toBe("Arlington, VA 22201 · travels 25 miles");
    expect(serviceAreaSummary({ zip: "22201" })).toBe("22201");
    expect(serviceAreaSummary({ radiusMiles: 1 })).toBe("travels 1 mile");
  });

  it("is empty, not a stray separator, when nothing is filled in", () => {
    expect(serviceAreaSummary({})).toBe("");
    expect(serviceAreaSummary({ address: "  ", zip: "nope", radiusMiles: 0 })).toBe("");
    expect(hasServiceArea({})).toBe(false);
    expect(hasServiceArea({ zip: "22201" })).toBe(true);
  });
});
