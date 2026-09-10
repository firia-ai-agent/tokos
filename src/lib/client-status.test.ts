import { describe, expect, it } from "vitest";
import { contractStatusLabel, invoicePayPanel, invoiceStatusLabel } from "./client-status";

/** Every status the app actually writes; see `src/lib/funnel.ts`. */
const CONTRACT_STATUSES = ["draft", "sent", "signed", "complete", "void"];
const INVOICE_STATUSES = ["open", "paid", "void"];
/** Every way a payment can end without money landing (TOK-48). */
const UNPAID_STATUSES = ["open", "failed", "canceled", "refunded", "voided", "void", "pending"];

describe("client status labels (TOK-41)", () => {
  it.each(CONTRACT_STATUSES)("humanises the contract status %s", (status) => {
    const shown = contractStatusLabel(status);
    expect(shown.label).not.toBe(status);
    expect(shown.label[0]).toBe(shown.label[0]?.toUpperCase());
  });

  it.each(INVOICE_STATUSES)("humanises the invoice status %s", (status) => {
    expect(invoiceStatusLabel(status).label).not.toBe(status);
  });

  it("says what the family is meant to do", () => {
    expect(contractStatusLabel("sent").label).toBe("Ready to sign");
    expect(contractStatusLabel("signed").label).toBe("Signed");
    expect(invoiceStatusLabel("open").label).toBe("Due");
    expect(invoiceStatusLabel("paid").label).toBe("Paid");
  });

  it("only calls a status a chore when it is one", () => {
    expect(contractStatusLabel("sent").tone).toBe("coral");
    expect(contractStatusLabel("signed").tone).toBe("ink");
    expect(invoiceStatusLabel("open").tone).toBe("coral");
    expect(invoiceStatusLabel("paid").tone).toBe("ink");
  });

  it("never echoes a code it does not know", () => {
    expect(contractStatusLabel("countersigning").label).toBe("Being prepared");
    expect(invoiceStatusLabel("uncollectible").label).toBe("Due");
  });
});

describe("no uncleared invoice ever reads as paid (TOK-48)", () => {
  it.each(UNPAID_STATUSES)("never labels %s as Paid", (status) => {
    expect(invoiceStatusLabel(status).label).not.toBe("Paid");
  });

  it.each(UNPAID_STATUSES)("never offers the paid thank-you for %s", (status) => {
    const panel = invoicePayPanel({ invoiceStatus: status });
    expect(panel.cleared).toBe(false);
    expect(panel.body).not.toBe("Paid — thank you.");
    expect(panel.badge.label).not.toBe("Paid");
  });

  it("says the honest word for each ending", () => {
    expect(invoiceStatusLabel("failed").label).toBe("Payment failed");
    expect(invoiceStatusLabel("refunded").label).toBe("Refunded");
    expect(invoiceStatusLabel("voided").label).toBe("Cancelled");
    expect(invoiceStatusLabel("canceled").label).toBe("Cancelled");
    expect(invoiceStatusLabel("pending").label).toBe("Payment pending");
  });
});

describe("pay page branch (TOK-48)", () => {
  it("thanks the family only when the money actually cleared", () => {
    const paid = invoicePayPanel({ invoiceStatus: "paid", paymentStatus: "cleared" });
    expect(paid.cleared).toBe(true);
    expect(paid.body).toBe("Paid — thank you.");
    expect(paid.action).toBe("none");
    expect(paid.badge.label).toBe("Paid");
  });

  it("shows the pay form, and no thank-you, on an open invoice", () => {
    const open = invoicePayPanel({ invoiceStatus: "open" });
    expect(open.action).toBe("pay");
    expect(open.body).toBeNull();
    expect(open.badge.label).toBe("Due");
  });

  it("keeps a failed stub payment Due with a working button (S0)", () => {
    // `recordPaymentFailure` leaves the invoice open on purpose — this is the regression.
    const failed = invoicePayPanel({ invoiceStatus: "open", paymentStatus: "failed" });
    expect(failed.action).toBe("pay");
    expect(failed.badge.label).toBe("Due");
    expect(failed.body).toBeNull();
    expect(failed.cleared).toBe(false);
    const canceled = invoicePayPanel({ invoiceStatus: "open", paymentStatus: "canceled" });
    expect(canceled.action).toBe("pay");
    expect(canceled.badge.label).toBe("Due");
  });

  it("gives cancelled, refunded and pending their own copy instead of the thank-you", () => {
    expect(invoicePayPanel({ invoiceStatus: "void" }).body).toBe("Cancelled — nothing is owed.");
    expect(invoicePayPanel({ invoiceStatus: "refunded" }).body).toBe(
      "Refunded — nothing is owed.",
    );
    expect(invoicePayPanel({ invoiceStatus: "pending" }).body).toMatch(/^Payment pending/);
    for (const status of ["void", "voided", "canceled", "refunded", "pending"]) {
      expect(invoicePayPanel({ invoiceStatus: status }).action).toBe("none");
    }
  });

  it("believes the payment row over an invoice row that drifted to paid", () => {
    const refunded = invoicePayPanel({ invoiceStatus: "paid", paymentStatus: "refunded" });
    expect(refunded.cleared).toBe(false);
    expect(refunded.body).toBe("Refunded — nothing is owed.");
    expect(refunded.badge.label).toBe("Refunded");

    const failed = invoicePayPanel({ invoiceStatus: "paid", paymentStatus: "failed" });
    expect(failed.cleared).toBe(false);
    expect(failed.body).not.toBe("Paid — thank you.");
    expect(failed.badge.label).not.toBe("Paid");
    expect(failed.action).toBe("pay");
  });

  it("does not guess Paid for a status it has never seen", () => {
    const unknown = invoicePayPanel({ invoiceStatus: "uncollectible" });
    expect(unknown.cleared).toBe(false);
    expect(unknown.body).toBeNull();
    expect(unknown.badge.label).toBe("Due");
    expect(unknown.action).toBe("pay");
  });
});
