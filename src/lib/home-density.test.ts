import { describe, expect, it } from "vitest";
import {
  CALM_EDGE,
  NEEDS_ACTION_EDGE,
  barHeightPercent,
  clearedTrend,
  contactFact,
  edgeClass,
  familyCard,
  familyCards,
  familyFacts,
  moneyFact,
  type FamilyCardInput,
} from "./home-density";

const TODAY = new Date("2026-09-10T12:00:00Z");

/** Jordan on the live capture: due Oct 1, birth support, off the website. */
const jordan: FamilyCardInput = {
  id: "c1",
  name: "Jordan Rivera",
  href: "/doula/clients/c1",
  stageLabel: "Fit confirmed",
  serviceType: "birth_support",
  edd: "2026-10-01",
  source: "web",
  lastContactAt: new Date("2026-09-08T12:00:00Z"),
};

describe("a Home card carries the facts the pipeline board carries", () => {
  it("reads service, EDD with gestation, and where she came from", () => {
    expect(familyFacts(jordan, TODAY)).toEqual([
      "Birth support",
      "EDD Oct 1 · 37w0d",
      "Website · 2d ago",
    ]);
  });

  it("drops a fact rather than printing a dash for it", () => {
    const bare: FamilyCardInput = {
      id: "c9",
      name: "No Details",
      href: "/doula/clients/c9",
      stageLabel: "New lead",
      source: "referral",
    };
    // Source is not-null on `clients`, so the contact fact is the one that always lands.
    expect(familyFacts(bare, TODAY)).toEqual(["Referral"]);
  });

  it("says where a lead came from without inventing a contact that never happened", () => {
    expect(contactFact("web form", null, TODAY)).toBe("Website");
    expect(contactFact("referral", new Date("2026-09-10T09:00:00Z"), TODAY)).toBe(
      "Referral · today",
    );
  });
});

describe("money is one line, worst first", () => {
  it("puts what she owes above what is unsigned, and both above what cleared", () => {
    expect(moneyFact({ outstandingCents: 90000, unsignedCents: 280000, clearedCents: 50000 }))
      .toEqual({ label: "$900 open", tone: "coral" });
    expect(moneyFact({ unsignedCents: 280000, clearedCents: 50000 })).toEqual({
      label: "$2,800 unsigned",
      tone: "coral",
    });
    expect(moneyFact({ clearedCents: 50000 })).toEqual({ label: "$500 paid", tone: "teal" });
  });

  it("says nothing at all when a family has no ledger yet", () => {
    expect(moneyFact({})).toBeNull();
    expect(moneyFact({ outstandingCents: 0, unsignedCents: 0, clearedCents: 0 })).toBeNull();
  });
});

describe("the terracotta edge means needs action today", () => {
  it("is drawn exactly when a needs-attention rule fired", () => {
    const clear = familyCard(jordan, TODAY);
    expect(clear.needsAction).toBe(false);
    expect(edgeClass(clear.needsAction)).toBe(CALM_EDGE);

    const flagged = familyCard(
      { ...jordan, attention: "Follow-up overdue · Not reviewed" },
      TODAY,
    );
    expect(flagged.needsAction).toBe(true);
    expect(flagged.attention).toBe("Follow-up overdue · Not reviewed");
    expect(edgeClass(flagged.needsAction)).toBe(NEEDS_ACTION_EDGE);
  });

  it("treats an empty reason string as nothing to flag", () => {
    expect(familyCard({ ...jordan, attention: "   " }, TODAY).needsAction).toBe(false);
  });

  it("floats the flagged families to the top of a list", () => {
    const cards = familyCards(
      [
        jordan,
        { ...jordan, id: "c2", name: "Avery Kim", attention: "Follow-up overdue" },
        { ...jordan, id: "c3", name: "Noor Vandermeer" },
      ],
      TODAY,
    );
    expect(cards.map((card) => card.name)).toEqual([
      "Avery Kim",
      "Jordan Rivera",
      "Noor Vandermeer",
    ]);
  });
});

describe("an empty chart does not get to own the fold", () => {
  it("draws no bars and points at the ledger when nothing has cleared", () => {
    const trend = clearedTrend([{ cents: 0 }, { cents: 0 }, { cents: 0 }], 0);
    expect(trend.hasHistory).toBe(false);
    expect(trend.chartHeight).toBe(0);
    expect(trend.note).toContain("never from demo numbers");
  });

  it("says so when the money cleared before the window rather than never", () => {
    expect(clearedTrend([{ cents: 0 }], 250000).note).toContain("Older payments");
  });

  it("draws the bars the moment one month is real", () => {
    const trend = clearedTrend([{ cents: 0 }, { cents: 90000 }], 90000);
    expect(trend.hasHistory).toBe(true);
    expect(trend.chartHeight).toBeGreaterThan(0);
  });

  it("keeps a real but tiny month visible", () => {
    expect(barHeightPercent(90000, 90000)).toBe(100);
    expect(barHeightPercent(100, 90000)).toBe(6);
    expect(barHeightPercent(0, 0)).toBe(0);
  });
});
