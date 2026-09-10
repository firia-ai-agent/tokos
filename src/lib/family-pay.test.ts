import { describe, expect, it } from "vitest";
import {
  displayLines,
  dueNote,
  familyInvoiceCount,
  familyPayCopy,
  familyPayGroups,
  opensByDefault,
  type FamilyInvoice,
} from "@/lib/family-pay";

const NOW = new Date("2026-09-10T12:00:00Z");
const shortDate = (value: Date) => value.toISOString().slice(0, 10);

function invoice(over: Partial<FamilyInvoice> = {}): FamilyInvoice {
  return {
    id: "inv-1",
    number: "NOVA-1001",
    status: "open",
    paymentStatus: "due",
    amountCents: 180000,
    currency: "usd",
    issuedAt: new Date("2026-09-01T00:00:00Z"),
    dueAt: new Date("2026-09-20T00:00:00Z"),
    paidAt: null,
    packageLabel: "Birth doula care",
    lines: [],
    ...over,
  };
}

const cleared = invoice({
  id: "cleared",
  status: "paid",
  paymentStatus: "cleared",
  paidAt: new Date("2026-09-05T00:00:00Z"),
});

describe("familyPayGroups", () => {
  it("puts everything still owed in outstanding and everything finished in history", () => {
    const groups = familyPayGroups([
      cleared,
      invoice({ id: "due" }),
      invoice({ id: "failed", paymentStatus: "failed" }),
      invoice({ id: "refunded", status: "refunded", paymentStatus: "refunded" }),
      invoice({ id: "cancelled", status: "void", paymentStatus: null }),
    ]);
    expect(groups.outstanding.map((item) => item.invoice.id)).toEqual(["due", "failed"]);
    expect(groups.history.map((item) => item.invoice.id).sort()).toEqual([
      "cancelled",
      "cleared",
      "refunded",
    ]);
  });

  it("keeps a payment still clearing out of history — it has not finished", () => {
    const groups = familyPayGroups([invoice({ id: "pending", status: "pending" })]);
    expect(groups.outstanding).toHaveLength(1);
    expect(groups.history).toHaveLength(0);
    expect(groups.outstanding[0].cleared).toBe(false);
  });

  it("only totals cleared money as paid", () => {
    const groups = familyPayGroups([
      cleared,
      invoice({ id: "failed", paymentStatus: "failed" }),
      invoice({ id: "refunded", status: "refunded", paymentStatus: "refunded" }),
    ]);
    expect(groups.clearedCents).toBe(180000);
    expect(groups.outstandingCents).toBe(180000);
  });

  it("never marks a refunded or failed invoice cleared", () => {
    const groups = familyPayGroups([
      invoice({ id: "refunded", status: "refunded", paymentStatus: "refunded" }),
      invoice({ id: "drift", status: "paid", paymentStatus: "failed" }),
    ]);
    expect(groups.history.every((item) => item.cleared === false)).toBe(true);
    // The drift case is still owed, and still gets a working Pay button.
    expect(groups.outstanding[0]?.panel.action).toBe("pay");
  });

  it("opens the oldest debt first", () => {
    const groups = familyPayGroups([
      invoice({ id: "later", dueAt: new Date("2026-10-01T00:00:00Z") }),
      invoice({ id: "sooner", dueAt: new Date("2026-09-02T00:00:00Z") }),
    ]);
    expect(groups.outstanding.map((item) => item.invoice.id)).toEqual(["sooner", "later"]);
    expect(opensByDefault(groups, 0)).toBe(true);
    expect(opensByDefault(groups, 1)).toBe(false);
  });

  it("lists history most recent first", () => {
    const older = invoice({
      id: "older",
      status: "paid",
      paymentStatus: "cleared",
      paidAt: new Date("2026-06-01T00:00:00Z"),
    });
    const groups = familyPayGroups([older, cleared]);
    expect(groups.history.map((item) => item.invoice.id)).toEqual(["cleared", "older"]);
  });

  it("handles a family with no invoices at all", () => {
    const groups = familyPayGroups([]);
    expect(groups).toMatchObject({ outstandingCents: 0, clearedCents: 0 });
    expect(opensByDefault(groups, 0)).toBe(false);
  });
});

describe("dueNote", () => {
  it("says how late rather than printing a date that has passed", () => {
    expect(dueNote({ dueAt: new Date("2026-09-01T12:00:00Z") }, NOW, shortDate)).toEqual({
      text: "9 days past due",
      tone: "coral",
    });
    expect(dueNote({ dueAt: new Date("2026-09-09T12:00:00Z") }, NOW, shortDate).text).toBe(
      "Due yesterday",
    );
  });

  it("marks today and tomorrow as the family's turn", () => {
    expect(dueNote({ dueAt: new Date("2026-09-10T12:00:00Z") }, NOW, shortDate)).toEqual({
      text: "Due today",
      tone: "coral",
    });
    expect(dueNote({ dueAt: new Date("2026-09-11T12:00:00Z") }, NOW, shortDate).text).toBe(
      "Due tomorrow",
    );
  });

  it("is quiet when the date is comfortably ahead", () => {
    const note = dueNote({ dueAt: new Date("2026-09-20T12:00:00Z") }, NOW, shortDate);
    expect(note).toEqual({ text: "Due 2026-09-20", tone: "ink" });
  });

  it("says so when there is no due date rather than inventing one", () => {
    expect(dueNote({ dueAt: null }, NOW, shortDate)).toEqual({
      text: "No due date set",
      tone: "ink",
    });
  });
});

describe("displayLines", () => {
  it("uses the invoice's own lines when it has them", () => {
    const lines = displayLines(
      invoice({
        lines: [{ id: "l1", description: "Postpartum visit", quantity: 2, unitAmountCents: 20000 }],
      }),
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].description).toBe("Postpartum visit");
  });

  it("falls back to the package rather than showing a family an empty table", () => {
    const [line] = displayLines(invoice());
    expect(line.description).toBe("Birth doula care");
    expect(line.unitAmountCents).toBe(180000);
  });

  it("falls back again when there is no package either", () => {
    expect(displayLines(invoice({ packageLabel: null }))[0].description).toBe("Doula care");
  });
});

describe("familyPayCopy", () => {
  const copy = familyPayCopy({ name: "Priya Raman", firstName: "Priya" });

  it("names the doula everywhere rather than saying 'your doula'", () => {
    const surface = JSON.stringify(copy);
    expect(surface).toContain("Priya");
    expect(surface.toLowerCase()).not.toContain("your doula");
  });

  it("keeps staff and CRM vocabulary off the family's page", () => {
    const surface = JSON.stringify(copy).toLowerCase();
    for (const word of ["buyer", "pipeline", "lead", "stage", "invoice #"]) {
      expect(surface).not.toContain(word);
    }
  });

  it("does not offer a payment method that is not wired", () => {
    const surface = JSON.stringify(copy).toLowerCase();
    expect(surface).not.toContain("ach");
    expect(surface).not.toContain("bank transfer");
    expect(copy.payLabel).toBe("Pay with card");
  });

  it("has warm, human empty states for both halves of the page", () => {
    expect(copy.nothingDue.title).toBe("Nothing due");
    expect(copy.noHistory.title).toBe("No payments yet");
    expect(copy.noHistory.body).toContain("Priya");
  });
});

describe("familyInvoiceCount", () => {
  it("pluralises", () => {
    expect(familyInvoiceCount(1)).toBe("1 invoice");
    expect(familyInvoiceCount(2)).toBe("2 invoices");
  });
});
