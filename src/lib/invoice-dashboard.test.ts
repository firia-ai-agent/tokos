import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAYMENT_TERM_DAYS,
  DUE_FILTERS,
  EMPTY_FILTERS,
  INVOICE_ACCENTS,
  INVOICE_COPY,
  INVOICE_CSV_HEADERS,
  INVOICE_TABS,
  STATUS_FILTERS,
  TYPE_FILTERS,
  daysOverdue,
  dueDateFrom,
  familyCountLabel,
  familyRollups,
  filterInvoices,
  hasActiveFilters,
  initialsOf,
  invoiceCleared,
  invoiceCountLabel,
  invoiceCsvRow,
  invoiceMatchesSearch,
  invoiceMoneyState,
  invoiceSummary,
  invoiceType,
  invoiceTypeLabel,
  invoicesToCsv,
  isOverdue,
  nextInvoiceNumber,
  packageRollups,
  pageCount,
  pageSlice,
  parseAmountToCents,
  paymentTermLabel,
  readFilters,
  readPage,
  showingLabel,
  sortInvoices,
  staffInvoiceStatus,
  toCsv,
  type InvoiceFilters,
  type InvoiceRecord,
  type PackageSource,
} from "@/lib/invoice-dashboard";

const NOW = new Date("2026-09-10T12:00:00Z");

function invoice(over: Partial<InvoiceRecord> = {}): InvoiceRecord {
  return {
    id: "inv-1",
    number: "NOVA-1001",
    clientId: "client-1",
    familyName: "Jordan Blake",
    familyEmail: "jordan@example.com",
    contractId: "contract-1",
    engagementId: "engagement-1",
    packageLabel: "Birth doula care",
    status: "open",
    paymentStatus: "due",
    amountCents: 180000,
    currency: "usd",
    issuedAt: new Date("2026-09-01T00:00:00Z"),
    dueAt: new Date("2026-09-20T00:00:00Z"),
    paidAt: null,
    ...over,
  };
}

const paid = invoice({ id: "paid", status: "paid", paymentStatus: "cleared", paidAt: NOW });
const late = invoice({ id: "late", dueAt: new Date("2026-09-03T00:00:00Z") });
const failed = invoice({ id: "failed", status: "open", paymentStatus: "failed" });
const refunded = invoice({ id: "refunded", status: "refunded", paymentStatus: "refunded" });

describe("money state", () => {
  it("calls an invoice paid only when the payment cleared", () => {
    expect(invoiceCleared(paid)).toBe(true);
    expect(invoiceCleared(failed)).toBe(false);
    // The drift case: the invoice row says paid, the payment row says it failed.
    expect(invoiceCleared(invoice({ status: "paid", paymentStatus: "failed" }))).toBe(false);
  });

  it("never counts a failed, pending, refunded or void invoice as paid", () => {
    for (const status of ["failed", "canceled", "refunded", "voided", "pending", "open"]) {
      expect(invoiceCleared(invoice({ status, paymentStatus: status }))).toBe(false);
    }
  });

  it("is overdue only when money is still owed past the due date", () => {
    expect(isOverdue(late, NOW)).toBe(true);
    expect(isOverdue(invoice(), NOW)).toBe(false);
    expect(isOverdue({ ...paid, dueAt: new Date("2026-09-03T00:00:00Z") }, NOW)).toBe(false);
    expect(isOverdue({ ...refunded, dueAt: new Date("2026-09-03T00:00:00Z") }, NOW)).toBe(false);
    expect(isOverdue(invoice({ dueAt: null }), NOW)).toBe(false);
  });

  it("counts whole days late, never zero for a late invoice", () => {
    expect(daysOverdue(late, NOW)).toBe(7);
    expect(daysOverdue(invoice(), NOW)).toBe(0);
    expect(
      daysOverdue(invoice({ dueAt: new Date("2026-09-10T11:00:00Z") }), NOW),
    ).toBe(1);
  });

  it("sorts every invoice into exactly one state", () => {
    expect(invoiceMoneyState(paid, NOW)).toBe("paid");
    expect(invoiceMoneyState(late, NOW)).toBe("overdue");
    expect(invoiceMoneyState(invoice(), NOW)).toBe("outstanding");
    expect(invoiceMoneyState(refunded, NOW)).toBe("closed");
  });
});

describe("invoiceSummary", () => {
  it("keeps cancelled and refunded money out of the billed total", () => {
    const [total] = invoiceSummary([paid, refunded], NOW);
    expect(total.amountCents).toBe(paid.amountCents);
    expect(total.count).toBe(1);
  });

  it("only counts cleared money as paid", () => {
    const summary = invoiceSummary([paid, failed, late], NOW);
    const byKey = Object.fromEntries(summary.map((kpi) => [kpi.key, kpi]));
    expect(byKey.paid.amountCents).toBe(180000);
    expect(byKey.paid.count).toBe(1);
    // A declined card leaves the bill owed, so it is outstanding, not paid.
    expect(byKey.outstanding.count).toBe(2);
    expect(byKey.outstanding.amountCents).toBe(360000);
  });

  it("counts overdue as a slice of outstanding rather than a fifth bucket", () => {
    const byKey = Object.fromEntries(
      invoiceSummary([late, invoice()], NOW).map((kpi) => [kpi.key, kpi]),
    );
    expect(byKey.outstanding.count).toBe(2);
    expect(byKey.overdue.count).toBe(1);
    expect(byKey.overdue.amountCents).toBe(late.amountCents);
  });

  it("returns four cards with money formatted and a count badge", () => {
    const summary = invoiceSummary([paid], NOW);
    expect(summary.map((kpi) => kpi.key)).toEqual(["total", "paid", "outstanding", "overdue"]);
    expect(summary[0].value).toBe("$1,800.00");
    expect(summary[0].badge).toBe("1 invoice");
    expect(summary[2].badge).toBe("0 invoices");
  });

  it("goes quiet rather than alarming when a bucket is empty", () => {
    const byKey = Object.fromEntries(
      invoiceSummary([paid], NOW).map((kpi) => [kpi.key, kpi]),
    );
    expect(byKey.overdue.tone).toBe("ink");
    expect(byKey.overdue.hint).toBe("Nothing is late");
    expect(byKey.paid.tone).toBe("teal");
  });

  it("handles an empty ledger", () => {
    const summary = invoiceSummary([], NOW);
    expect(summary.every((kpi) => kpi.count === 0 && kpi.amountCents === 0)).toBe(true);
    expect(summary[0].value).toBe("$0.00");
  });
});

describe("staffInvoiceStatus", () => {
  it("says Paid only for cleared money", () => {
    expect(staffInvoiceStatus(paid, NOW)).toEqual({ label: "Paid", tone: "teal" });
    expect(staffInvoiceStatus(invoice({ status: "paid", paymentStatus: "failed" }), NOW).label).toBe(
      "Payment failed",
    );
  });

  it("names the failure rather than hiding it behind Due", () => {
    expect(staffInvoiceStatus(failed, NOW).label).toBe("Payment failed");
    expect(staffInvoiceStatus(invoice({ paymentStatus: "pending" }), NOW).label).toBe("Clearing");
    expect(staffInvoiceStatus(refunded, NOW).label).toBe("Refunded");
    expect(staffInvoiceStatus(invoice({ status: "void", paymentStatus: null }), NOW).label).toBe(
      "Cancelled",
    );
  });

  it("says how late a late invoice is", () => {
    expect(staffInvoiceStatus(late, NOW).label).toBe("Overdue by 7 days");
    expect(staffInvoiceStatus(late, NOW).tone).toBe("coral");
    expect(
      staffInvoiceStatus(invoice({ dueAt: new Date("2026-09-09T12:00:00Z") }), NOW).label,
    ).toBe("Overdue by 1 day");
  });

  it("falls back to Due for a status nobody has seen before", () => {
    expect(staffInvoiceStatus(invoice({ status: "weird", paymentStatus: null }), NOW).label).toBe(
      "Due",
    );
  });
});

describe("invoice type", () => {
  it("reads a package from the engagement or the agreement behind it", () => {
    expect(invoiceType(invoice())).toBe("package");
    expect(invoiceType(invoice({ engagementId: null }))).toBe("package");
    expect(invoiceType(invoice({ engagementId: null, contractId: null }))).toBe("one_time");
  });

  it("labels from the config map, never from a literal", () => {
    expect(invoiceTypeLabel(invoice())).toBe("Care package");
    expect(invoiceTypeLabel(invoice({ engagementId: null, contractId: null }))).toBe("One-time");
    expect(TYPE_FILTERS.map((option) => option.label)).toContain("Care package");
  });
});

describe("filters", () => {
  const rows = [paid, late, failed, refunded, invoice({ id: "plain" })];

  const filters = (over: Partial<InvoiceFilters>): InvoiceFilters => ({
    ...EMPTY_FILTERS,
    ...over,
  });

  it("reads unknown options back as 'any' rather than filtering to nothing", () => {
    const read = readFilters({ status: "nonsense", due: "7", q: "  jordan " });
    expect(read.status).toBe("all");
    expect(read.due).toBe("7");
    expect(read.q).toBe("jordan");
  });

  it("takes the first value when a param arrives twice", () => {
    expect(readFilters({ status: ["paid", "overdue"] }).status).toBe("paid");
  });

  it("knows when nothing is filtered", () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
    expect(hasActiveFilters(filters({ q: "jordan" }))).toBe(true);
  });

  it("filters by money state", () => {
    expect(filterInvoices(rows, filters({ status: "paid" }), NOW).map((r) => r.id)).toEqual([
      "paid",
    ]);
    expect(filterInvoices(rows, filters({ status: "overdue" }), NOW).map((r) => r.id)).toEqual([
      "late",
    ]);
    expect(filterInvoices(rows, filters({ status: "closed" }), NOW).map((r) => r.id)).toEqual([
      "refunded",
    ]);
    expect(filterInvoices(rows, filters({ status: "failed" }), NOW).map((r) => r.id)).toEqual([
      "failed",
    ]);
  });

  it("counts a late invoice as still owed", () => {
    expect(filterInvoices(rows, filters({ status: "outstanding" }), NOW).map((r) => r.id)).toEqual([
      "late",
      "failed",
      "plain",
    ]);
  });

  it("filters by due window, past due and no due date", () => {
    expect(filterInvoices(rows, filters({ due: "overdue" }), NOW).map((r) => r.id)).toEqual([
      "late",
    ]);
    // 10 days out is inside 30 but outside 7.
    expect(filterInvoices([invoice()], filters({ due: "7" }), NOW)).toHaveLength(0);
    expect(filterInvoices([invoice()], filters({ due: "30" }), NOW)).toHaveLength(1);
    expect(
      filterInvoices([invoice({ dueAt: null })], filters({ due: "none" }), NOW),
    ).toHaveLength(1);
  });

  it("filters by how long ago the invoice was raised", () => {
    const old = invoice({ id: "old", issuedAt: new Date("2025-01-01T00:00:00Z") });
    expect(filterInvoices([old, invoice()], filters({ issued: "30" }), NOW)).toHaveLength(1);
    expect(filterInvoices([old, invoice()], filters({ issued: "all" }), NOW)).toHaveLength(2);
  });

  it("filters by type", () => {
    const oneTime = invoice({ id: "one", engagementId: null, contractId: null });
    expect(
      filterInvoices([oneTime, invoice()], filters({ type: "one_time" }), NOW).map((r) => r.id),
    ).toEqual(["one"]);
  });

  it("searches family, email, number and package", () => {
    expect(invoiceMatchesSearch(invoice(), "jordan")).toBe(true);
    expect(invoiceMatchesSearch(invoice(), "NOVA-1001")).toBe(true);
    expect(invoiceMatchesSearch(invoice(), "example.com")).toBe(true);
    expect(invoiceMatchesSearch(invoice(), "birth doula")).toBe(true);
    expect(invoiceMatchesSearch(invoice(), "avery")).toBe(false);
    expect(invoiceMatchesSearch(invoice(), "   ")).toBe(true);
  });

  it("floats late invoices above newer ones", () => {
    const fresh = invoice({ id: "fresh", issuedAt: new Date("2026-09-09T00:00:00Z") });
    expect(sortInvoices([fresh, late], NOW).map((row) => row.id)).toEqual(["late", "fresh"]);
  });
});

describe("pagination", () => {
  const rows = Array.from({ length: 7 }, (_, index) => invoice({ id: `i-${index}` }));

  it("never reports zero pages", () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(7, 3)).toBe(3);
  });

  it("clamps a page number that is out of range or nonsense", () => {
    expect(readPage("2", 7, 3)).toBe(2);
    expect(readPage("99", 7, 3)).toBe(3);
    expect(readPage("-4", 7, 3)).toBe(1);
    expect(readPage(undefined, 7, 3)).toBe(1);
    expect(readPage("abc", 7, 3)).toBe(1);
  });

  it("slices the page a doula asked for", () => {
    expect(pageSlice(rows, 2, 3).map((row) => row.id)).toEqual(["i-3", "i-4", "i-5"]);
  });

  it("writes the footer line", () => {
    expect(showingLabel(1, 2)).toBe("Showing 1–2 of 2 invoices");
    expect(showingLabel(2, 7, 3)).toBe("Showing 4–6 of 7 invoices");
    expect(showingLabel(1, 1)).toBe("Showing 1–1 of 1 invoice");
    expect(showingLabel(1, 0)).toBe("Nothing to show");
  });
});

describe("familyRollups", () => {
  const avery = invoice({
    id: "avery-1",
    clientId: "client-2",
    familyName: "Avery Diaz",
    familyEmail: "avery@example.com",
    amountCents: 90000,
    status: "paid",
    paymentStatus: "cleared",
  });

  it("rolls one row per family with money-safe totals", () => {
    const [first, second] = familyRollups([paid, late, avery], NOW);
    expect(first.clientId).toBe("client-1");
    expect(first.invoiceCount).toBe(2);
    expect(first.paidCents).toBe(180000);
    expect(first.outstandingCents).toBe(180000);
    expect(first.overdueCents).toBe(180000);
    expect(second.name).toBe("Avery Diaz");
    expect(second.outstandingCents).toBe(0);
  });

  it("sorts by what is owed, so the nudge list is the top of the table", () => {
    expect(familyRollups([avery, late], NOW).map((row) => row.name)).toEqual([
      "Jordan Blake",
      "Avery Diaz",
    ]);
  });

  it("keeps closed invoices out of billed", () => {
    const [family] = familyRollups([refunded], NOW);
    expect(family.billedCents).toBe(0);
    expect(family.invoiceCount).toBe(1);
  });

  it("remembers the most recent invoice", () => {
    const older = invoice({ id: "old", number: "NOVA-1000", issuedAt: new Date("2026-01-01") });
    const [family] = familyRollups([older, invoice()], NOW);
    expect(family.lastInvoiceNumber).toBe("NOVA-1001");
  });

  it("builds initials for the avatar chip", () => {
    expect(initialsOf("Jordan Blake")).toBe("JB");
    expect(initialsOf("Maya")).toBe("MA");
    expect(initialsOf("  ")).toBe("—");
    expect(initialsOf("Jordan van der Blake")).toBe("JB");
  });
});

describe("packageRollups", () => {
  const engagement = (over: Partial<PackageSource> = {}): PackageSource => ({
    id: "eng-1",
    packageLabel: "Birth doula care",
    amountCents: 180000,
    currency: "usd",
    status: "open",
    clientId: "client-1",
    ...over,
  });

  it("reads the catalogue from real engagements", () => {
    const [pkg] = packageRollups([engagement()], [], NOW);
    expect(pkg.label).toBe("Birth doula care");
    expect(pkg.familyCount).toBe(1);
    expect(pkg.activeCount).toBe(1);
  });

  it("shows the range when families were charged different amounts", () => {
    const [pkg] = packageRollups(
      [engagement(), engagement({ id: "eng-2", amountCents: 220000, clientId: "client-2" })],
      [],
      NOW,
    );
    expect(pkg.lowCents).toBe(180000);
    expect(pkg.highCents).toBe(220000);
    expect(pkg.familyCount).toBe(2);
  });

  it("counts one family once however many engagements she has", () => {
    const [pkg] = packageRollups([engagement(), engagement({ id: "eng-2" })], [], NOW);
    expect(pkg.familyCount).toBe(1);
  });

  it("attributes billed and outstanding money by package label", () => {
    const [pkg] = packageRollups([engagement()], [paid, late, refunded], NOW);
    expect(pkg.billedCents).toBe(360000);
    expect(pkg.outstandingCents).toBe(180000);
  });

  it("ignores an invoice whose package the practice does not offer", () => {
    const [pkg] = packageRollups(
      [engagement()],
      [invoice({ packageLabel: "Something else" })],
      NOW,
    );
    expect(pkg.billedCents).toBe(0);
  });
});

describe("CSV export", () => {
  it("exports the columns a spreadsheet needs", () => {
    const row = invoiceCsvRow(paid, NOW);
    expect(row).toHaveLength(INVOICE_CSV_HEADERS.length);
    expect(row[0]).toBe("NOVA-1001");
    expect(row[5]).toBe("1800.00");
    expect(row[7]).toBe("Paid");
  });

  it("never exports a paid date for money that did not clear", () => {
    const refundedWithStamp = invoice({
      status: "refunded",
      paymentStatus: "refunded",
      paidAt: NOW,
    });
    expect(invoiceCsvRow(refundedWithStamp, NOW).at(-1)).toBe("");
  });

  it("quotes cells so a family name with a comma survives", () => {
    expect(toCsv(["A"], [['Blake, Jordan "JB"']])).toBe(
      '"A"\r\n"Blake, Jordan ""JB"""',
    );
  });

  it("writes a header row plus one line per invoice", () => {
    expect(invoicesToCsv([paid, late], NOW).split("\r\n")).toHaveLength(3);
  });
});

describe("numbering and terms", () => {
  it("continues the practice's own numbering", () => {
    expect(nextInvoiceNumber(0)).toBe("NOVA-1001");
    expect(nextInvoiceNumber(12)).toBe("NOVA-1013");
  });

  it("has one default term, shared with the contract flow", () => {
    expect(DEFAULT_PAYMENT_TERM_DAYS).toBe(7);
    expect(paymentTermLabel(7)).toBe("Due in 7 days");
    expect(paymentTermLabel(0)).toBe("Due on receipt");
    expect(paymentTermLabel(45)).toBe("Due in 45 days");
    expect(dueDateFrom(new Date("2026-09-10T00:00:00Z")).toISOString()).toBe(
      "2026-09-17T00:00:00.000Z",
    );
  });

  it("parses dollars into cents, and refuses anything that is not money", () => {
    expect(parseAmountToCents("1200")).toBe(120000);
    expect(parseAmountToCents("$1,200.50")).toBe(120050);
    expect(parseAmountToCents(" 12.5 ")).toBe(1250);
    expect(parseAmountToCents("0")).toBeNull();
    expect(parseAmountToCents("-40")).toBeNull();
    expect(parseAmountToCents("12.345")).toBeNull();
    expect(parseAmountToCents("")).toBeNull();
    expect(parseAmountToCents(null)).toBeNull();
  });
});

describe("copy contract", () => {
  it("never calls a family a buyer, a lead, or a customer", () => {
    const surface = JSON.stringify({ INVOICE_COPY, INVOICE_TABS, STATUS_FILTERS, DUE_FILTERS });
    for (const word of ["Buyer", "buyer", "lead", "Lead", "customer", "Customer"]) {
      expect(surface).not.toContain(word);
    }
  });

  it("keeps the four tabs pointed at real routes", () => {
    expect(INVOICE_TABS.map((tab) => tab.label)).toEqual([
      "Invoicing",
      "Families",
      "Packages",
      "Templates",
    ]);
    expect(INVOICE_TABS.every((tab) => tab.href.startsWith("/doula/invoices"))).toBe(true);
    // Only the index tab matches exactly; the rest are prefixes of their own segment.
    expect(INVOICE_TABS.filter((tab) => tab.exact)).toHaveLength(1);
  });

  it("keeps the accent palette inside Faith's brand", () => {
    expect(INVOICE_ACCENTS.map((accent) => accent.value)).toEqual([
      "#0F6E56",
      "#04342C",
      "#D85A30",
      "#4E9C86",
    ]);
  });

  it("pluralises counts", () => {
    expect(invoiceCountLabel(1)).toBe("1 invoice");
    expect(invoiceCountLabel(0)).toBe("0 invoices");
    expect(familyCountLabel(1)).toBe("1 family");
    expect(familyCountLabel(3)).toBe("3 families");
  });
});
